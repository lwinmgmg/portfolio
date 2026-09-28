import "server-only";

import type { WithId } from "mongodb";

import type { TransactionContext } from "@/server/db/transaction";
import {
  RagIndexNotFoundError,
  RagIndexStateError,
  type IndexConfig,
  type NewRagIndex,
  type RagIndex,
  type RagIndexRepository,
  type RagIndexStats,
} from "@/server/domain/rag";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type RagIndexDocument = {
  sourceType: RagIndex["sourceType"];
  sourceId: string;
  config: IndexConfig;
  state: RagIndex["state"];
  active: boolean;
  error: string | null;
  stats: RagIndexStats | null;
  createdAt: Date;
  finishedAt: Date | null;
};

const NOT_READY = "Only a ready index can be activated.";

export class MongoRagIndexRepository
  extends MongoRepository<RagIndex, RagIndexDocument>
  implements RagIndexRepository
{
  constructor() {
    super("rag_indexes");
  }

  protected toEntity(document: WithId<RagIndexDocument>): RagIndex {
    return {
      id: document._id.toHexString(),
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      config: { ...document.config },
      state: document.state,
      active: document.active,
      error: document.error,
      stats: document.stats ? { ...document.stats } : null,
      createdAt: document.createdAt.toISOString(),
      finishedAt: document.finishedAt === null ? null : document.finishedAt.toISOString(),
    };
  }

  protected override createIndexes(): Promise<unknown> {
    return Promise.all([
      this.collection().createIndex({ createdAt: -1 }),
      // At most one active index.
      this.collection().createIndex(
        { active: 1 },
        { unique: true, partialFilterExpression: { active: true } },
      ),
    ]);
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async create(input: NewRagIndex): Promise<RagIndex> {
    await this.ensureReady();
    const document: RagIndexDocument = {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      config: { ...input.config },
      state: "building",
      active: false,
      error: null,
      stats: null,
      createdAt: parseInstant(input.createdAt),
      finishedAt: null,
    };
    const result = await this.collection().insertOne(document);
    return this.toEntity({ ...document, _id: result.insertedId });
  }

  async findById(id: string): Promise<RagIndex | null> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.findByObjectId(objectId);
  }

  async findActive(): Promise<RagIndex | null> {
    await this.ensureReady();
    const document = await this.collection().findOne({ active: true });
    return document ? this.toEntity(document) : null;
  }

  async list(limit: number): Promise<RagIndex[]> {
    await this.ensureReady();
    const documents = await this.collection()
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => this.toEntity(document));
  }

  markReady(id: string, stats: RagIndexStats, finishedAt: string): Promise<RagIndex | null> {
    return this.settle(id, {
      state: "ready",
      stats: { ...stats },
      error: null,
      finishedAt: parseInstant(finishedAt),
    });
  }

  markFailed(id: string, error: string, finishedAt: string): Promise<RagIndex | null> {
    return this.settle(id, {
      state: "failed",
      error,
      finishedAt: parseInstant(finishedAt),
    });
  }

  async activate(id: string, tx: TransactionContext): Promise<RagIndex> {
    const objectId = this.parseId(id);
    if (!objectId) throw new RagIndexNotFoundError(id);

    const existing = await this.collection().findOne({ _id: objectId }, { session: tx.session });
    if (!existing) throw new RagIndexNotFoundError(id);
    if (existing.state !== "ready") throw new RagIndexStateError(NOT_READY);

    // Deactivate first. The partial unique index allows only one active index.
    await this.collection().updateMany(
      { active: true, _id: { $ne: objectId } },
      { $set: { active: false } },
      { session: tx.session },
    );
    const document = await this.collection().findOneAndUpdate(
      { _id: objectId, state: "ready" },
      { $set: { active: true } },
      { returnDocument: "after", session: tx.session },
    );
    if (!document) throw new RagIndexStateError(NOT_READY);
    return this.toEntity(document);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return false;
    const result = await this.collection().deleteOne({ _id: objectId, active: false });
    return result.deletedCount === 1;
  }

  // A build settles once. A late write from a stale build cannot overwrite the outcome.
  private async settle(
    id: string,
    fields: Partial<RagIndexDocument>,
  ): Promise<RagIndex | null> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return null;
    const document = await this.collection().findOneAndUpdate(
      { _id: objectId, state: "building" },
      { $set: fields },
      { returnDocument: "after" },
    );
    return document ? this.toEntity(document) : null;
  }
}
