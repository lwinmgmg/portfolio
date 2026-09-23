import type { TransactionContext } from "@/server/db/transaction";
import {
  isPublicSessionKey,
  PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT,
  PUBLIC_SESSION_GLOBAL_ISSUE_WINDOW_MS,
  PUBLIC_SESSION_IP_ISSUE_LIMIT,
  PUBLIC_SESSION_IP_ISSUE_WINDOW_MS,
  PUBLIC_SESSION_REQUEST_LIMIT,
  PUBLIC_SESSION_TTL_MS,
  type PublicSession,
  type PublicSessionRepository,
} from "@/server/domain/public-session";
import type { SessionAdmission } from "@/server/http/public-session-limiter";
import {
  createPublicSessionKey,
  hashClientIp,
  hashPublicSessionKey,
} from "@/server/http/public-session-key";

export class PublicSessionLimited extends Error {
  constructor() {
    super("limited");
    this.name = "PublicSessionLimited";
  }
}

export class PublicSessionRejected extends Error {
  readonly reason: "invalid" | "exhausted";

  constructor(reason: "invalid" | "exhausted") {
    super(reason);
    this.name = "PublicSessionRejected";
    this.reason = reason;
  }
}

export type IssuedPublicSession = {
  sessionKey: string;
  expiresAt: Date;
};

export type RotatedPublicSession = {
  sessionKey: string;
  expiresAt: Date;
};

type TransactionRunner = <T>(
  work: (tx: TransactionContext) => Promise<T>,
) => Promise<T>;

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function isExhausted(session: PublicSession, now: Date): boolean {
  return (
    session.requestCount >= session.requestLimit &&
    Date.parse(session.expiresAt) > now.getTime()
  );
}

export class PublicSessionService {
  constructor(
    private readonly sessions: PublicSessionRepository,
    private readonly admission: SessionAdmission,
    private readonly transaction: TransactionRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(ip: string | null): Promise<IssuedPublicSession> {
    if (!this.admission.allowIssue(ip)) {
      throw new PublicSessionLimited();
    }

    await this.sessions.ensureReady();
    const now = this.now();
    const ipHash = ip ? hashClientIp(ip) : null;

    if (ipHash) {
      const ipSince = new Date(now.getTime() - PUBLIC_SESSION_IP_ISSUE_WINDOW_MS);
      const recentForIp = await this.sessions.countCreatedByIpSince(ipHash, ipSince);
      if (recentForIp >= PUBLIC_SESSION_IP_ISSUE_LIMIT) {
        throw new PublicSessionLimited();
      }
    }

    const globalSince = new Date(now.getTime() - PUBLIC_SESSION_GLOBAL_ISSUE_WINDOW_MS);
    const recent = await this.sessions.countCreatedSince(globalSince);
    if (recent >= PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT) {
      throw new PublicSessionLimited();
    }

    const sessionKey = createPublicSessionKey();
    const expiresAt = new Date(now.getTime() + PUBLIC_SESSION_TTL_MS);
    try {
      await this.transaction((tx) =>
        this.sessions.create(
          {
            keyHash: hashPublicSessionKey(sessionKey),
            requestLimit: PUBLIC_SESSION_REQUEST_LIMIT,
            ipHash,
            createdAt: now,
            expiresAt,
          },
          tx,
        ),
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }

    return { sessionKey, expiresAt };
  }

  async consume(sessionKey: string, ip: string | null): Promise<RotatedPublicSession> {
    if (!isPublicSessionKey(sessionKey) || this.admission.isLookupSaturated(ip)) {
      throw new PublicSessionRejected("invalid");
    }

    const now = this.now();
    const nextKey = createPublicSessionKey();
    const updated = await this.sessions.consume(
      hashPublicSessionKey(sessionKey),
      hashPublicSessionKey(nextKey),
      now,
    );
    if (updated) {
      return { sessionKey: nextKey, expiresAt: new Date(updated.expiresAt) };
    }

    const existing = await this.sessions.findByKeyHash(hashPublicSessionKey(sessionKey));
    if (existing && isExhausted(existing, now)) {
      throw new PublicSessionRejected("exhausted");
    }

    this.admission.recordFailure(ip);
    throw new PublicSessionRejected("invalid");
  }
}
