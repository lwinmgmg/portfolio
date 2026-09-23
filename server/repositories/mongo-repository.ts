import "server-only";

import {
  type Collection,
  type Document,
  type Filter,
  ObjectId,
  type OptionalUnlessRequiredId,
  type WithId,
} from "mongodb";

import { getDb } from "@/server/db/client";
import type { TransactionContext } from "@/server/db/transaction";

export abstract class MongoRepository<
  TEntity extends { id: string },
  TSchema extends Document,
> {
  private indexesReady: Promise<void> | null = null;

  protected constructor(private readonly collectionName: string) {}

  protected collection(): Collection<TSchema> {
    return getDb().collection<TSchema>(this.collectionName);
  }

  protected abstract toEntity(document: WithId<TSchema>): TEntity;

  protected createIndexes(): Promise<unknown> {
    return Promise.resolve();
  }

  // Failed index builds are forgotten so the next call can retry.
  protected ensureIndexes(): Promise<void> {
    this.indexesReady ??= this.createIndexes().then(
      () => undefined,
      (error: unknown) => {
        this.indexesReady = null;
        throw error;
      },
    );
    return this.indexesReady;
  }

  protected parseId(id: string): ObjectId | null {
    if (!ObjectId.isValid(id)) return null;
    return new ObjectId(id);
  }

  protected async findByObjectId(id: ObjectId): Promise<TEntity | null> {
    const document = await this.collection().findOne({ _id: id } as Filter<TSchema>);
    return document ? this.toEntity(document) : null;
  }

  protected async insert(
    document: OptionalUnlessRequiredId<TSchema>,
    tx: TransactionContext,
  ): Promise<TEntity> {
    const result = await this.collection().insertOne(document, {
      session: tx.session,
    });
    return this.toEntity({
      ...document,
      _id: result.insertedId,
    } as WithId<TSchema>);
  }
}
