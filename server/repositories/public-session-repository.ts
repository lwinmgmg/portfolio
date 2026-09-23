import "server-only";

import { type Filter, type WithId } from "mongodb";

import type { TransactionContext } from "@/server/db/transaction";
import type {
  NewPublicSession,
  PublicSession,
  PublicSessionRepository,
} from "@/server/domain/public-session";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type PublicSessionDocument = {
  keyHash: string;
  requestCount: number;
  requestLimit: number;
  ipHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
};

export class MongoPublicSessionRepository
  extends MongoRepository<PublicSession, PublicSessionDocument>
  implements PublicSessionRepository
{
  constructor() {
    super("public_sessions");
  }

  protected toEntity(document: WithId<PublicSessionDocument>): PublicSession {
    return {
      id: document._id.toHexString(),
      keyHash: document.keyHash,
      requestCount: document.requestCount,
      requestLimit: document.requestLimit,
      ipHash: document.ipHash,
      createdAt: document.createdAt.toISOString(),
      expiresAt: document.expiresAt.toISOString(),
      lastUsedAt: document.lastUsedAt.toISOString(),
    };
  }

  protected override createIndexes(): Promise<unknown> {
    return Promise.all([
      this.collection().createIndex({ keyHash: 1 }, { unique: true }),
      this.collection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.collection().createIndex({ ipHash: 1, createdAt: -1 }),
    ]);
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async countCreatedSince(since: Date): Promise<number> {
    await this.ensureReady();
    return this.collection().countDocuments({ createdAt: { $gt: since } });
  }

  async countCreatedByIpSince(ipHash: string, since: Date): Promise<number> {
    await this.ensureReady();
    return this.collection().countDocuments({
      ipHash,
      createdAt: { $gt: since },
    });
  }

  create(input: NewPublicSession, tx: TransactionContext): Promise<PublicSession> {
    return this.insert(
      {
        keyHash: input.keyHash,
        requestCount: 0,
        requestLimit: input.requestLimit,
        ipHash: input.ipHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        lastUsedAt: input.createdAt,
      },
      tx,
    );
  }

  // One conditional update so two callers of the same key cannot both succeed.
  async consume(
    keyHash: string,
    nextKeyHash: string,
    now: Date,
  ): Promise<PublicSession | null> {
    await this.ensureReady();
    const document = await this.collection().findOneAndUpdate(
      {
        keyHash,
        expiresAt: { $gt: now },
        $expr: { $lt: ["$requestCount", "$requestLimit"] },
      } as Filter<PublicSessionDocument>,
      {
        $inc: { requestCount: 1 },
        $set: { keyHash: nextKeyHash, lastUsedAt: now },
      },
      { returnDocument: "after" },
    );
    return document ? this.toEntity(document) : null;
  }

  async findByKeyHash(keyHash: string): Promise<PublicSession | null> {
    const document = await this.collection().findOne({ keyHash });
    return document ? this.toEntity(document) : null;
  }
}
