import {
  PUBLIC_SESSION_GLOBAL_FAILURE_LIMIT,
  PUBLIC_SESSION_GLOBAL_FAILURE_WINDOW_MS,
  PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT,
  PUBLIC_SESSION_GLOBAL_ISSUE_WINDOW_MS,
  PUBLIC_SESSION_IP_FAILURE_LIMIT,
  PUBLIC_SESSION_IP_FAILURE_WINDOW_MS,
  PUBLIC_SESSION_IP_ISSUE_LIMIT,
  PUBLIC_SESSION_IP_ISSUE_WINDOW_MS,
  PUBLIC_SESSION_MAX_TRACKED_IPS,
} from "@/server/domain/public-session";

export type SessionAdmission = {
  allowIssue(ip: string | null): boolean;
  isLookupSaturated(ip: string | null): boolean;
  recordFailure(ip: string | null): void;
};

export type PublicSessionLimiterOptions = {
  now?: () => number;
  globalIssueLimit?: number;
  globalIssueWindowMs?: number;
  ipIssueLimit?: number;
  ipIssueWindowMs?: number;
  globalFailureLimit?: number;
  globalFailureWindowMs?: number;
  ipFailureLimit?: number;
  ipFailureWindowMs?: number;
  maxTrackedIps?: number;
};

function prune(stamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  let index = 0;
  while (index < stamps.length && stamps[index] <= cutoff) index += 1;
  return index === 0 ? stamps : stamps.slice(index);
}

export class PublicSessionLimiter implements SessionAdmission {
  private readonly now: () => number;
  private readonly globalIssueLimit: number;
  private readonly globalIssueWindowMs: number;
  private readonly ipIssueLimit: number;
  private readonly ipIssueWindowMs: number;
  private readonly globalFailureLimit: number;
  private readonly globalFailureWindowMs: number;
  private readonly ipFailureLimit: number;
  private readonly ipFailureWindowMs: number;
  private readonly maxTrackedIps: number;
  private globalIssues: number[] = [];
  private globalFailures: number[] = [];
  private readonly ipIssues = new Map<string, number[]>();
  private readonly ipFailures = new Map<string, number[]>();

  constructor(options: PublicSessionLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.globalIssueLimit = options.globalIssueLimit ?? PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT;
    this.globalIssueWindowMs =
      options.globalIssueWindowMs ?? PUBLIC_SESSION_GLOBAL_ISSUE_WINDOW_MS;
    this.ipIssueLimit = options.ipIssueLimit ?? PUBLIC_SESSION_IP_ISSUE_LIMIT;
    this.ipIssueWindowMs = options.ipIssueWindowMs ?? PUBLIC_SESSION_IP_ISSUE_WINDOW_MS;
    this.globalFailureLimit =
      options.globalFailureLimit ?? PUBLIC_SESSION_GLOBAL_FAILURE_LIMIT;
    this.globalFailureWindowMs =
      options.globalFailureWindowMs ?? PUBLIC_SESSION_GLOBAL_FAILURE_WINDOW_MS;
    this.ipFailureLimit = options.ipFailureLimit ?? PUBLIC_SESSION_IP_FAILURE_LIMIT;
    this.ipFailureWindowMs =
      options.ipFailureWindowMs ?? PUBLIC_SESSION_IP_FAILURE_WINDOW_MS;
    this.maxTrackedIps = options.maxTrackedIps ?? PUBLIC_SESSION_MAX_TRACKED_IPS;
  }

  trackedIssueIpCount(): number {
    return this.ipIssues.size;
  }

  allowIssue(ip: string | null): boolean {
    const now = this.now();
    this.globalIssues = prune(this.globalIssues, now, this.globalIssueWindowMs);
    if (this.globalIssues.length >= this.globalIssueLimit) return false;

    if (ip) {
      const stamps = this.liveStamps(this.ipIssues, ip, now, this.ipIssueWindowMs);
      if (stamps) {
        if (stamps.length >= this.ipIssueLimit) return false;
        stamps.push(now);
      } else if (!this.trackNewIp(this.ipIssues, ip, now, this.ipIssueWindowMs)) {
        this.globalIssues.push(now);
        return true;
      }
    }

    this.globalIssues.push(now);
    return true;
  }

  isLookupSaturated(ip: string | null): boolean {
    const now = this.now();
    this.globalFailures = prune(this.globalFailures, now, this.globalFailureWindowMs);
    if (this.globalFailures.length >= this.globalFailureLimit) return true;
    if (!ip) return false;
    const stamps = this.liveStamps(this.ipFailures, ip, now, this.ipFailureWindowMs);
    return stamps !== null && stamps.length >= this.ipFailureLimit;
  }

  recordFailure(ip: string | null): void {
    const now = this.now();
    this.globalFailures = prune(this.globalFailures, now, this.globalFailureWindowMs);
    this.globalFailures.push(now);
    if (!ip) return;

    const stamps = this.liveStamps(this.ipFailures, ip, now, this.ipFailureWindowMs);
    if (stamps) {
      stamps.push(now);
      return;
    }
    this.trackNewIp(this.ipFailures, ip, now, this.ipFailureWindowMs);
  }

  private liveStamps(
    buckets: Map<string, number[]>,
    ip: string,
    now: number,
    windowMs: number,
  ): number[] | null {
    const existing = buckets.get(ip);
    if (!existing) return null;
    const pruned = prune(existing, now, windowMs);
    if (pruned.length === 0) {
      buckets.delete(ip);
      return null;
    }
    if (pruned !== existing) buckets.set(ip, pruned);
    return pruned;
  }

  private trackNewIp(
    buckets: Map<string, number[]>,
    ip: string,
    now: number,
    windowMs: number,
  ): boolean {
    this.evictExpired(buckets, now, windowMs);
    if (buckets.size >= this.maxTrackedIps) return false;
    buckets.set(ip, [now]);
    return true;
  }

  private evictExpired(buckets: Map<string, number[]>, now: number, windowMs: number): void {
    if (buckets.size < this.maxTrackedIps) return;
    for (const [ip, stamps] of buckets) {
      const pruned = prune(stamps, now, windowMs);
      if (pruned.length === 0) buckets.delete(ip);
      else if (pruned !== stamps) buckets.set(ip, pruned);
    }
  }
}
