import type { TransactionContext } from "@/server/db/transaction";

export const PUBLIC_SESSION_COOKIE = "public_session";

export const PUBLIC_SESSION_HOLD_COOKIE = "public_session_hold";

export const PUBLIC_SESSION_HOLD_VALUE = "1";

export const PUBLIC_SESSION_REQUEST_LIMIT = 60;

export const PUBLIC_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export const PUBLIC_SESSION_HOLD_SECONDS = 60;

export const PUBLIC_SESSION_GLOBAL_ISSUE_LIMIT = 30;

export const PUBLIC_SESSION_GLOBAL_ISSUE_WINDOW_MS = 60 * 1000;

export const PUBLIC_SESSION_IP_ISSUE_LIMIT = 10;

export const PUBLIC_SESSION_IP_ISSUE_WINDOW_MS = 60 * 60 * 1000;

export const PUBLIC_SESSION_IP_FAILURE_LIMIT = 60;

export const PUBLIC_SESSION_IP_FAILURE_WINDOW_MS = 60 * 1000;

export const PUBLIC_SESSION_GLOBAL_FAILURE_LIMIT = 300;

export const PUBLIC_SESSION_GLOBAL_FAILURE_WINDOW_MS = 60 * 1000;

export const PUBLIC_SESSION_MAX_TRACKED_IPS = 1024;

const PUBLIC_SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isPublicSessionKey(value: string): boolean {
  return PUBLIC_SESSION_KEY_PATTERN.test(value);
}

export type PublicSession = {
  id: string;
  keyHash: string;
  requestCount: number;
  requestLimit: number;
  ipHash: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
};

export type NewPublicSession = {
  keyHash: string;
  requestLimit: number;
  ipHash: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export interface PublicSessionRepository {
  ensureReady(): Promise<void>;
  countCreatedSince(since: Date): Promise<number>;
  countCreatedByIpSince(ipHash: string, since: Date): Promise<number>;
  create(input: NewPublicSession, tx: TransactionContext): Promise<PublicSession>;
  consume(
    keyHash: string,
    nextKeyHash: string,
    now: Date,
  ): Promise<PublicSession | null>;
  findByKeyHash(keyHash: string): Promise<PublicSession | null>;
}
