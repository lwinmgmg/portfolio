import "server-only";

import type { ClientSession, TransactionOptions } from "mongodb";

import { getMongoClient } from "@/server/db/client";

// Passed through repositories so concurrent requests never share a session.
export class TransactionContext {
  constructor(readonly session: ClientSession) {}
}

// Majority + journal: a commit is durable after a primary failover.
// Snapshot reads see only data committed before this transaction starts.
const durableTransaction: TransactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority", journal: true },
  readPreference: "primary",
};

export async function runTransaction<T>(
  work: (tx: TransactionContext) => Promise<T>,
): Promise<T> {
  const session = getMongoClient().startSession();
  try {
    // The driver may invoke `work` again after a transient commit failure.
    // Keep the callback to database calls that use this session.
    return await session.withTransaction(
      () => work(new TransactionContext(session)),
      durableTransaction,
    );
  } finally {
    await session.endSession();
  }
}
