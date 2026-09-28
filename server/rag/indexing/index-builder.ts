import type { ChatClient, EmbeddingClient } from "@/server/domain/llm";
import {
  RagError,
  type Chunker,
  type ChunkerKind,
  type ChunkDraft,
  type Contextualizer,
  type CorpusDocument,
  type CorpusSource,
  type IndexConfig,
  type NewEmbeddedChunk,
  type RagChunkRepository,
  type RagIndex,
  type RagIndexRepository,
  type RagIndexStats,
} from "@/server/domain/rag";
import { UsageMeter } from "@/server/llm/usage-meter";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";
import { composeIndexText } from "@/server/rag/contextualize/index-text";
import { NoopContextualizer } from "@/server/rag/contextualize/noop-contextualizer";
import { embedInBatches, EMBEDDING_BATCH_SIZE } from "@/server/rag/embedding/embed-in-batches";
import { l2Normalize } from "@/server/rag/embedding/l2-normalize";
import { parseIndexConfig } from "@/server/rag/indexing/index-config";

const BUILD_ERROR_LIMIT = 500;

// Makes the contextualizer for one build. The chat client it gets is metered for that build.
export type ContextualizerFactory = (chat: ChatClient, model: string) => Contextualizer;

export type IndexBuilderDependencies = {
  corpus: CorpusSource;
  chunkers: Readonly<Record<ChunkerKind, Chunker>>;
  contextualizers: ContextualizerFactory;
  chat: ChatClient;
  embeddings: EmbeddingClient;
  indexes: Pick<RagIndexRepository, "create" | "markReady" | "markFailed">;
  chunks: Pick<RagChunkRepository, "insertMany" | "deleteByIndex">;
  now?: () => Date;
  embeddingBatchSize?: number;
};

// A started build: the index row exists in state `building` and `run` fills it.
// Split in two so a caller can answer as soon as the row exists and run the rest later.
export type IndexBuildJob = {
  index: RagIndex;
  run(): Promise<RagIndex>;
};

export interface IndexBuilding {
  start(config: IndexConfig): Promise<IndexBuildJob>;
}

export class IndexBuildError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "IndexBuildError";
  }
}

// CorpusSource -> Chunker -> Contextualizer -> Embedder -> rag_chunks, for one RagIndex.
export class IndexBuilder implements IndexBuilding {
  private readonly now: () => Date;
  private readonly embeddingBatchSize: number;

  constructor(private readonly deps: IndexBuilderDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.embeddingBatchSize = deps.embeddingBatchSize ?? EMBEDDING_BATCH_SIZE;
  }

  async build(config: IndexConfig): Promise<RagIndex> {
    const job = await this.start(config);
    return job.run();
  }

  // Validates the config and loads the corpus before creating the index, because the index
  // records the corpus source id. Nothing is written when this throws.
  async start(input: IndexConfig): Promise<IndexBuildJob> {
    const config = parseIndexConfig(input);
    const startedAt = this.now();
    const doc = await this.deps.corpus.load();
    if (doc === null) throw new IndexBuildError("Publish a CV before building an index.");

    const index = await this.deps.indexes.create({
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      config,
      createdAt: startedAt.toISOString(),
    });

    let ran = false;
    return {
      index,
      run: () => {
        if (ran) return Promise.reject(new IndexBuildError("This build has already run."));
        ran = true;
        return this.run(index, doc, startedAt);
      },
    };
  }

  private async run(index: RagIndex, doc: CorpusDocument, startedAt: Date): Promise<RagIndex> {
    try {
      const stats = await this.fill(index, doc, startedAt);
      const ready = await this.deps.indexes.markReady(index.id, stats, this.now().toISOString());
      if (!ready) {
        throw new IndexBuildError("The index was deleted or settled while it was building.");
      }
      return ready;
    } catch (error) {
      await this.cleanUp(index.id, error);
      throw error;
    }
  }

  private async fill(index: RagIndex, doc: CorpusDocument, startedAt: Date): Promise<RagIndexStats> {
    const { config } = index;
    const drafts = this.deps.chunkers[config.chunker].chunk(doc);
    if (drafts.length === 0) throw new IndexBuildError("The CV produced no chunks.");

    const meter = new UsageMeter();
    const contexts = await this.contextualizerFor(config, meter).contextualize(
      doc,
      drafts.map((draft) => draft.text),
    );
    if (contexts.length !== drafts.length) {
      throw new IndexBuildError("The contextualizer returned the wrong number of contexts.");
    }

    const indexTexts = drafts.map((draft, i) => composeIndexText(contexts[i] ?? null, draft.text));
    const vectors = await embedInBatches(
      meter.embeddings(this.deps.embeddings),
      config.embeddingModel,
      indexTexts,
      this.embeddingBatchSize,
    );

    const chunks = drafts.map(
      (draft, i): NewEmbeddedChunk =>
        embeddedChunk(draft, contexts[i] ?? null, indexTexts[i] ?? draft.text, vectors[i] ?? []),
    );
    await this.deps.chunks.insertMany(chunks, index.id);

    return {
      chunks: chunks.length,
      tokens: indexTexts.reduce((total, text) => total + estimateTokens(text), 0),
      durationMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
      costUsd: meter.costUsd,
      contextFailures: config.contextualize
        ? contexts.filter((context) => context === null).length
        : 0,
    };
  }

  private contextualizerFor(config: IndexConfig, meter: UsageMeter): Contextualizer {
    if (!config.contextualize || config.contextModel === null) return new NoopContextualizer();
    return this.deps.contextualizers(meter.chat(this.deps.chat), config.contextModel);
  }

  // Best effort: the build error is what the caller needs, so cleanup errors are only logged.
  private async cleanUp(indexId: string, error: unknown): Promise<void> {
    try {
      await this.deps.chunks.deleteByIndex(indexId);
    } catch (cleanupError) {
      console.error(cleanupError);
    }
    try {
      await this.deps.indexes.markFailed(indexId, buildErrorMessage(error), this.now().toISOString());
    } catch (cleanupError) {
      console.error(cleanupError);
    }
  }
}

function embeddedChunk(
  draft: ChunkDraft,
  context: string | null,
  indexText: string,
  vector: number[],
): NewEmbeddedChunk {
  return {
    ordinal: draft.ordinal,
    section: draft.section,
    title: draft.title,
    entityKeys: [...draft.entityKeys],
    text: draft.text,
    context,
    indexText,
    tokenCount: draft.tokenCount,
    embedding: l2Normalize(vector),
  };
}

function buildErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.length > 0 ? error.message : "The index build failed.";
  return Array.from(message).slice(0, BUILD_ERROR_LIMIT).join("");
}
