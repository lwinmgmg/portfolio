import type { TransactionContext } from "@/server/db/transaction";
import {
  RagIndexNotFoundError,
  RagIndexStateError,
  type EmbeddedChunk,
  type NewEmbeddedChunk,
  type NewRagIndex,
  type RagChunkRepository,
  type RagIndex,
  type RagIndexRepository,
  type RagIndexStats,
  type RagSettingsRepository,
  type RetrievalConfig,
} from "@/server/domain/rag";

// In-memory repositories with the same state rules as the Mongo ones. `events` records calls.
export class MemoryRagIndexes implements RagIndexRepository {
  rows: RagIndex[] = [];
  events: string[] = [];

  ensureReady(): Promise<void> {
    this.events.push("ready");
    return Promise.resolve();
  }

  create(input: NewRagIndex): Promise<RagIndex> {
    this.events.push("create");
    const index: RagIndex = {
      id: `index-${this.rows.length + 1}`,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      config: { ...input.config },
      state: "building",
      active: false,
      error: null,
      stats: null,
      createdAt: input.createdAt,
      finishedAt: null,
    };
    this.rows.push(index);
    return Promise.resolve({ ...index });
  }

  findById(id: string): Promise<RagIndex | null> {
    const row = this.rows.find((index) => index.id === id);
    return Promise.resolve(row ? { ...row } : null);
  }

  findActive(): Promise<RagIndex | null> {
    const row = this.rows.find((index) => index.active);
    return Promise.resolve(row ? { ...row } : null);
  }

  list(limit: number): Promise<RagIndex[]> {
    return Promise.resolve(
      [...this.rows]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((index) => ({ ...index })),
    );
  }

  markReady(id: string, stats: RagIndexStats, finishedAt: string): Promise<RagIndex | null> {
    this.events.push("markReady");
    return Promise.resolve(this.settle(id, { state: "ready", stats, error: null, finishedAt }));
  }

  markFailed(id: string, error: string, finishedAt: string): Promise<RagIndex | null> {
    this.events.push("markFailed");
    return Promise.resolve(this.settle(id, { state: "failed", error, finishedAt }));
  }

  activate(id: string, tx: TransactionContext): Promise<RagIndex> {
    if (!tx.session) throw new Error("activate ran outside a transaction");
    this.events.push("activate");
    const target = this.rows.find((index) => index.id === id);
    if (!target) return Promise.reject(new RagIndexNotFoundError(id));
    if (target.state !== "ready") {
      return Promise.reject(new RagIndexStateError("Only a ready index can be activated."));
    }
    for (const row of this.rows) row.active = row.id === id;
    return Promise.resolve({ ...target });
  }

  delete(id: string): Promise<boolean> {
    this.events.push("delete");
    const before = this.rows.length;
    this.rows = this.rows.filter((index) => index.id !== id || index.active);
    return Promise.resolve(this.rows.length < before);
  }

  private settle(id: string, fields: Partial<RagIndex>): RagIndex | null {
    const row = this.rows.find((index) => index.id === id);
    if (!row || row.state !== "building") return null;
    Object.assign(row, fields);
    return { ...row };
  }
}

export class MemoryRagChunks implements RagChunkRepository {
  rows: EmbeddedChunk[] = [];
  events: string[] = [];

  ensureReady(): Promise<void> {
    return Promise.resolve();
  }

  insertMany(chunks: NewEmbeddedChunk[], indexId: string): Promise<number> {
    this.events.push("insertMany");
    for (const chunk of chunks) {
      this.rows.push({ ...chunk, id: `${indexId}:${chunk.ordinal}`, indexId });
    }
    return Promise.resolve(chunks.length);
  }

  listByIndex(indexId: string): Promise<EmbeddedChunk[]> {
    return Promise.resolve(
      this.rows
        .filter((chunk) => chunk.indexId === indexId)
        .sort((a, b) => a.ordinal - b.ordinal),
    );
  }

  deleteByIndex(indexId: string): Promise<number> {
    this.events.push("deleteByIndex");
    const before = this.rows.length;
    this.rows = this.rows.filter((chunk) => chunk.indexId !== indexId);
    return Promise.resolve(before - this.rows.length);
  }
}

export class MemoryRagSettings implements RagSettingsRepository {
  // The chat config as stored: anything, since a stored config may predate the schema.
  chat: { config: unknown; updatedAt: string } | null = null;

  ensureReady(): Promise<void> {
    return Promise.resolve();
  }

  findChatConfig(): Promise<{ config: unknown; updatedAt: string } | null> {
    return Promise.resolve(this.chat ? structuredClone(this.chat) : null);
  }

  saveChatConfig(config: RetrievalConfig, updatedAt: string): Promise<void> {
    this.chat = { config: { ...config }, updatedAt };
    return Promise.resolve();
  }
}

const session = {} as TransactionContext["session"];

// Runs the work with a stand-in transaction context, like the CV service tests.
export function fakeTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
  return work({ session });
}
