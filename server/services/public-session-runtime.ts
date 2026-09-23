import "server-only";

import { runTransaction } from "@/server/db/transaction";
import { PublicSessionLimiter } from "@/server/http/public-session-limiter";
import { MongoPublicSessionRepository } from "@/server/repositories/public-session-repository";
import { PublicSessionService } from "@/server/services/public-session-service";

const globalForLimiter = globalThis as unknown as {
  publicSessionLimiter?: PublicSessionLimiter;
};

function limiter(): PublicSessionLimiter {
  globalForLimiter.publicSessionLimiter ??= new PublicSessionLimiter();
  return globalForLimiter.publicSessionLimiter;
}

const publicSessions = new PublicSessionService(
  new MongoPublicSessionRepository(),
  limiter(),
  runTransaction,
);

export function issuePublicSession(ip: string | null) {
  return publicSessions.issue(ip);
}

export function consumePublicSession(sessionKey: string, ip: string | null) {
  return publicSessions.consume(sessionKey, ip);
}
