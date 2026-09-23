import { expect, test } from "bun:test";

import type { TransactionContext } from "@/server/db/transaction";
import {
  PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT,
  PUBLIC_SESSION_IP_ISSUE_LIMIT,
  PUBLIC_SESSION_REQUEST_LIMIT,
  PUBLIC_SESSION_TTL_MS,
  type NewPublicSession,
  type PublicSession,
  type PublicSessionRepository,
} from "@/server/domain/public-session";
import { PublicSessionLimiter, type SessionAdmission } from "@/server/http/public-session-limiter";
import {
  createPublicSessionKey,
  hashClientIp,
  hashPublicSessionKey,
} from "@/server/http/public-session-key";
import {
  PublicSessionLimited,
  PublicSessionRejected,
  PublicSessionService,
} from "@/server/services/public-session-service";

class MemorySessions implements PublicSessionRepository {
  rows: PublicSession[] = [];
  createCalls = 0;
  consumeCalls = 0;

  ensureReady(): Promise<void> {
    return Promise.resolve();
  }

  countCreatedSince(since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter((row) => Date.parse(row.createdAt) > since.getTime()).length,
    );
  }

  countCreatedByIpSince(ipHash: string, since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (row) => row.ipHash === ipHash && Date.parse(row.createdAt) > since.getTime(),
      ).length,
    );
  }

  create(input: NewPublicSession): Promise<PublicSession> {
    this.createCalls += 1;
    const row: PublicSession = {
      id: String(this.rows.length + 1),
      keyHash: input.keyHash,
      requestCount: 0,
      requestLimit: input.requestLimit,
      ipHash: input.ipHash,
      createdAt: input.createdAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      lastUsedAt: input.createdAt.toISOString(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  consume(keyHash: string, nextKeyHash: string, now: Date): Promise<PublicSession | null> {
    this.consumeCalls += 1;
    const row = this.rows.find((item) => item.keyHash === keyHash);
    if (!row) return Promise.resolve(null);
    if (Date.parse(row.expiresAt) <= now.getTime()) return Promise.resolve(null);
    if (row.requestCount >= row.requestLimit) return Promise.resolve(null);
    row.requestCount += 1;
    row.keyHash = nextKeyHash;
    row.lastUsedAt = now.toISOString();
    return Promise.resolve({ ...row });
  }

  findByKeyHash(keyHash: string): Promise<PublicSession | null> {
    const row = this.rows.find((item) => item.keyHash === keyHash);
    return Promise.resolve(row ? { ...row } : null);
  }
}

const allowAll: SessionAdmission = {
  allowIssue: () => true,
  isLookupSaturated: () => false,
  recordFailure: () => undefined,
};

const denyAll: SessionAdmission = {
  allowIssue: () => false,
  isLookupSaturated: () => false,
  recordFailure: () => undefined,
};

function service(
  repo: MemorySessions,
  admission: SessionAdmission,
  now: () => Date,
): PublicSessionService {
  const run = <T>(work: (tx: TransactionContext) => Promise<T>) =>
    work({} as TransactionContext);
  return new PublicSessionService(repo, admission, run, now);
}

test("issue stores the hash and returns a different raw key", async () => {
  const repo = new MemorySessions();
  const issued = await service(repo, allowAll, () => new Date("2026-01-01T00:00:00Z")).issue(
    "203.0.113.5",
  );

  expect(issued.sessionKey).not.toBe(repo.rows[0]?.keyHash);
  expect(repo.rows[0]?.keyHash).toBe(hashPublicSessionKey(issued.sessionKey));
  expect(repo.rows[0]?.ipHash).toBe(hashClientIp("203.0.113.5"));
  expect(repo.rows[0]?.requestCount).toBe(0);
  expect(repo.rows[0]?.requestLimit).toBe(PUBLIC_SESSION_REQUEST_LIMIT);
});

test("a limiter rejection does not touch the repository", async () => {
  const repo = new MemorySessions();
  let ready = false;
  repo.ensureReady = () => {
    ready = true;
    return Promise.resolve();
  };

  await expect(service(repo, denyAll, () => new Date()).issue(null)).rejects.toBeInstanceOf(
    PublicSessionLimited,
  );
  expect(ready).toBe(false);
  expect(repo.createCalls).toBe(0);
});

test("the database IP ceiling skips insert", async () => {
  const repo = new MemorySessions();
  repo.countCreatedByIpSince = () => Promise.resolve(PUBLIC_SESSION_IP_ISSUE_LIMIT);

  await expect(
    service(repo, allowAll, () => new Date()).issue("203.0.113.5"),
  ).rejects.toBeInstanceOf(PublicSessionLimited);
  expect(repo.createCalls).toBe(0);
});

test("the database global ceiling skips insert", async () => {
  const repo = new MemorySessions();
  repo.countCreatedSince = () => Promise.resolve(PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT);

  await expect(service(repo, allowAll, () => new Date()).issue(null)).rejects.toBeInstanceOf(
    PublicSessionLimited,
  );
  expect(repo.createCalls).toBe(0);
});

test("the second consume of the same key is invalid", async () => {
  const repo = new MemorySessions();
  const now = new Date("2026-01-01T00:00:00Z");
  const sessions = service(repo, allowAll, () => now);
  const issued = await sessions.issue(null);
  const rotated = await sessions.consume(issued.sessionKey, null);

  expect(rotated.sessionKey).not.toBe(issued.sessionKey);
  await expect(sessions.consume(issued.sessionKey, null)).rejects.toMatchObject({
    reason: "invalid",
  });
  expect(repo.rows[0]?.keyHash).toBe(hashPublicSessionKey(rotated.sessionKey));
});

test("the 60th accept succeeds and the next is exhausted without rotating", async () => {
  const repo = new MemorySessions();
  const sessions = service(repo, allowAll, () => new Date("2026-01-01T00:00:00Z"));
  let key = (await sessions.issue(null)).sessionKey;

  for (let accept = 0; accept < PUBLIC_SESSION_REQUEST_LIMIT; accept += 1) {
    key = (await sessions.consume(key, null)).sessionKey;
  }

  const hash = repo.rows[0]?.keyHash;
  await expect(sessions.consume(key, null)).rejects.toBeInstanceOf(PublicSessionRejected);
  await expect(sessions.consume(key, null)).rejects.toMatchObject({ reason: "exhausted" });
  expect(repo.rows[0]?.keyHash).toBe(hash);
  expect(repo.rows[0]?.requestCount).toBe(PUBLIC_SESSION_REQUEST_LIMIT);
});

test("an expired key is invalid", async () => {
  let time = Date.parse("2026-01-01T00:00:00Z");
  const sessions = service(new MemorySessions(), allowAll, () => new Date(time));
  const issued = await sessions.issue(null);
  time += PUBLIC_SESSION_TTL_MS + 1;

  await expect(sessions.consume(issued.sessionKey, null)).rejects.toMatchObject({
    reason: "invalid",
  });
});

test("a malformed key never calls the repository", async () => {
  const repo = new MemorySessions();
  await expect(service(repo, allowAll, () => new Date()).consume("nope", null)).rejects.toMatchObject(
    { reason: "invalid" },
  );
  expect(repo.consumeCalls).toBe(0);
});

test("failed lookups stop calling the repository after the ceiling", async () => {
  const repo = new MemorySessions();
  const limiter = new PublicSessionLimiter({
    now: () => Date.parse("2026-01-01T00:00:00Z"),
    ipFailureLimit: 1,
    globalFailureLimit: 10,
  });
  const sessions = service(repo, limiter, () => new Date("2026-01-01T00:00:00Z"));

  await expect(sessions.consume(createPublicSessionKey(), "203.0.113.9")).rejects.toMatchObject({
    reason: "invalid",
  });
  const calls = repo.consumeCalls;
  expect(calls).toBe(1);

  await expect(sessions.consume(createPublicSessionKey(), "203.0.113.9")).rejects.toMatchObject({
    reason: "invalid",
  });
  expect(repo.consumeCalls).toBe(calls);
});
