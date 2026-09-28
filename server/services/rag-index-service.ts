import type { TransactionContext } from "@/server/db/transaction";
import type { CvPublishedListener } from "@/server/domain/cv";
import {
  RagIndexNotFoundError,
  RagIndexStateError,
  type EmbeddedChunk,
  type IndexConfig,
  type RagChunkRepository,
  type RagIndex,
  type RagIndexRepository,
} from "@/server/domain/rag";
import type { IndexBuildJob, IndexBuilding } from "@/server/rag/indexing/index-builder";

export type TransactionRunner = <T>(
  work: (tx: TransactionContext) => Promise<T>,
) => Promise<T>;

// A build still `building` after this long is treated as dead (e.g. the function timed out).
const STALE_BUILD_MS = 5 * 60 * 1000;

export function isIndexBuildInProgress(index: RagIndex, now = new Date()): boolean {
  return index.state === "building" && !isStaleBuild(index, now);
}

export function isIndexBuildStalled(index: RagIndex, now = new Date()): boolean {
  return index.state === "building" && isStaleBuild(index, now);
}

export function canActivateIndex(index: RagIndex): boolean {
  return index.state === "ready" && !index.active;
}

// The active index serves chat, and a running build would write chunks into a deleted index.
export function canDeleteIndex(index: RagIndex, now = new Date()): boolean {
  return !index.active && !isIndexBuildInProgress(index, now);
}

export class RagIndexService implements CvPublishedListener {
  constructor(
    private readonly builder: IndexBuilding,
    private readonly indexes: RagIndexRepository,
    private readonly chunks: RagChunkRepository,
    private readonly transaction: TransactionRunner,
    // Built and activated on every CV publish.
    private readonly defaultConfig: IndexConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(limit: number): Promise<RagIndex[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("The index list limit must be a positive integer.");
    }
    return this.indexes.list(limit);
  }

  get(id: string): Promise<RagIndex | null> {
    return this.indexes.findById(id);
  }

  // Null when the index does not exist.
  async getWithChunks(id: string): Promise<{ index: RagIndex; chunks: EmbeddedChunk[] } | null> {
    const index = await this.indexes.findById(id);
    if (!index) return null;
    return { index, chunks: await this.chunks.listByIndex(index.id) };
  }

  // Creates the index row and returns the job that fills it, so a caller can run it later.
  startBuild(config: IndexConfig): Promise<IndexBuildJob> {
    return this.builder.start(config);
  }

  async build(config: IndexConfig): Promise<RagIndex> {
    const job = await this.startBuild(config);
    return job.run();
  }

  async activate(id: string): Promise<RagIndex> {
    await this.indexes.ensureReady();
    return this.transaction((tx) => this.indexes.activate(id, tx));
  }

  async buildAndActivate(config: IndexConfig): Promise<RagIndex> {
    const built = await this.build(config);
    return this.activate(built.id);
  }

  async delete(id: string): Promise<void> {
    const index = await this.indexes.findById(id);
    if (!index) throw new RagIndexNotFoundError(id);
    if (index.active) throw new RagIndexStateError("The active index cannot be deleted.");
    if (isIndexBuildInProgress(index, this.now())) {
      throw new RagIndexStateError("Wait for the build to finish before deleting the index.");
    }
    // The repository refuses an index that became active since the read above.
    const deleted = await this.indexes.delete(id);
    if (!deleted) throw new RagIndexStateError("The index could not be deleted.");
    await this.chunks.deleteByIndex(id);
  }

  // Chat always answers from the newly published CV.
  async onCvPublished(): Promise<void> {
    await this.buildAndActivate(this.defaultConfig);
  }
}

function isStaleBuild(index: RagIndex, now: Date): boolean {
  const createdAt = Date.parse(index.createdAt);
  return Number.isNaN(createdAt) || now.getTime() - createdAt >= STALE_BUILD_MS;
}
