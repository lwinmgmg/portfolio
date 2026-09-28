import { expect, test } from "bun:test";

import type { ChatClient, EmbeddingClient } from "@/server/domain/llm";
import type {
  Chunker,
  Contextualizer,
  CorpusDocument,
  IndexConfig,
  RagIndexStats,
} from "@/server/domain/rag";
import {
  MemoryRagChunks,
  MemoryRagIndexes,
} from "@/server/rag/__fixtures__/memory-rag-repositories";
import { sampleCorpus } from "@/server/rag/__fixtures__/sample-corpus";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import { TokenWindowChunker } from "@/server/rag/chunking/token-window-chunker";
import { EmbeddingError } from "@/server/rag/embedding/embedding-error";
import {
  IndexBuildError,
  IndexBuilder,
  type IndexBuilderDependencies,
} from "@/server/rag/indexing/index-builder";
import { InvalidIndexConfigError } from "@/server/rag/indexing/index-config";

const contextualized: IndexConfig = {
  chunker: "structured",
  contextualize: true,
  embeddingModel: "embed-model",
  contextModel: "utility-model",
};

const plain: IndexConfig = { ...contextualized, contextualize: false, contextModel: null };

const chat: ChatClient = {
  complete: async (request) => ({
    text: "unused",
    usage: { promptTokens: 1, completionTokens: 1, cost: 0.01 },
    model: request.model,
  }),
  stream: () => {
    throw new Error("not used");
  },
};

// Writes "ctx <n>" for each text, or null for the ordinals in `failing`. Records every call so
// tests can check the model and that usage goes through the metered chat client.
class FakeContextualizer implements Contextualizer {
  constructor(
    private readonly chatClient: ChatClient,
    private readonly failing: ReadonlySet<number>,
  ) {}

  async contextualize(_doc: CorpusDocument, texts: string[]): Promise<(string | null)[]> {
    await this.chatClient.complete({ model: "utility-model", messages: [] });
    return texts.map((_, index) => (this.failing.has(index) ? null : `ctx ${index}`));
  }
}

// Vector [3, 4, 0] for every text, so normalization is easy to see: [0.6, 0.8, 0].
function embeddingsFake(overrides: Partial<EmbeddingClient> = {}) {
  const calls: Array<{ model: string; texts: string[] }> = [];
  const client: EmbeddingClient = {
    embed: async (input) => {
      calls.push(input);
      return {
        vectors: input.texts.map(() => [3, 4, 0]),
        usage: { promptTokens: 5, completionTokens: 0, cost: 0.002 },
      };
    },
    ...overrides,
  };
  return { client, calls };
}

function setup(options: {
  corpus?: CorpusDocument | null;
  failing?: number[];
  embeddings?: EmbeddingClient;
  chunkers?: IndexBuilderDependencies["chunkers"];
  chunks?: MemoryRagChunks;
} = {}) {
  const indexes = new MemoryRagIndexes();
  const chunks = options.chunks ?? new MemoryRagChunks();
  const embeddings = embeddingsFake();
  const contextModels: string[] = [];
  const times = [0, 4_000, 4_500].map(
    (offset) => new Date(Date.parse("2026-09-28T09:00:00.000Z") + offset),
  );
  let tick = 0;
  const builder = new IndexBuilder({
    corpus: { load: async () => (options.corpus === undefined ? sampleCorpus : options.corpus) },
    chunkers: options.chunkers ?? {
      structured: new StructuredCvChunker(),
      "token-window": new TokenWindowChunker(),
    },
    contextualizers: (meteredChat, model) => {
      contextModels.push(model);
      return new FakeContextualizer(meteredChat, new Set(options.failing ?? []));
    },
    chat,
    embeddings: options.embeddings ?? embeddings.client,
    indexes,
    chunks,
    now: () => times[Math.min(tick++, times.length - 1)] ?? new Date(0),
    embeddingBatchSize: 4,
  });
  return { builder, indexes, chunks, embeddings, contextModels };
}

async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error("Expected a rejection.");
    },
    (error: unknown) => error,
  );
}

test("a contextualized build stores normalized, contextualized chunks and marks the index ready", async () => {
  const { builder, indexes, chunks, embeddings, contextModels } = setup();
  const drafts = new StructuredCvChunker().chunk(sampleCorpus);

  const index = await builder.build(contextualized);

  expect(indexes.events).toEqual(["create", "markReady"]);
  expect(index.state).toBe("ready");
  expect(index.sourceId).toBe(sampleCorpus.sourceId);
  expect(index.config).toEqual(contextualized);
  expect(index.createdAt).toBe("2026-09-28T09:00:00.000Z");
  expect(index.finishedAt).toBe("2026-09-28T09:00:04.500Z");
  expect(contextModels).toEqual(["utility-model"]);

  const stored = await chunks.listByIndex(index.id);
  expect(stored.length).toBe(drafts.length);
  stored.forEach((chunk, i) => {
    const draft = drafts[i];
    expect(chunk.ordinal).toBe(draft?.ordinal);
    expect(chunk.entityKeys).toEqual(draft?.entityKeys ?? []);
    expect(chunk.text).toBe(draft?.text);
    expect(chunk.tokenCount).toBe(draft?.tokenCount);
    expect(chunk.context).toBe(`ctx ${i}`);
    expect(chunk.indexText).toBe(`ctx ${i}\n\n${draft?.text}`);
    expect(chunk.embedding).toEqual([0.6, 0.8, 0]);
  });

  expect(embeddings.calls.every((call) => call.model === "embed-model")).toBe(true);
  expect(embeddings.calls.flatMap((call) => call.texts)).toEqual(
    stored.map((chunk) => chunk.indexText),
  );
  expect(embeddings.calls.every((call) => call.texts.length <= 4)).toBe(true);

  const stats: RagIndexStats | null = index.stats;
  expect(stats?.chunks).toBe(drafts.length);
  expect(stats?.tokens).toBe(
    stored.reduce((total, chunk) => total + Math.ceil(chunk.indexText.length / 4), 0),
  );
  expect(stats?.durationMs).toBe(4_000);
  // One metered chat call (0.01) plus one metered embedding call per batch (0.002 each).
  expect(stats?.costUsd).toBeCloseTo(0.01 + 0.002 * embeddings.calls.length);
  expect(stats?.contextFailures).toBe(0);
});

test("a failed context leaves that chunk uncontextualized and is counted", async () => {
  const { builder, chunks } = setup({ failing: [1] });

  const index = await builder.build(contextualized);

  const stored = await chunks.listByIndex(index.id);
  expect(stored[1]?.context).toBeNull();
  expect(stored[1]?.indexText).toBe(stored[1]?.text);
  expect(index.stats?.contextFailures).toBe(1);
});

test("without contextualize no contextualizer runs and index text is the chunk text", async () => {
  const { builder, chunks, contextModels } = setup();

  const index = await builder.build({ ...plain, chunker: "token-window" });

  expect(contextModels).toEqual([]);
  const stored = await chunks.listByIndex(index.id);
  expect(stored.length).toBe(new TokenWindowChunker().chunk(sampleCorpus).length);
  expect(stored.every((chunk) => chunk.context === null && chunk.indexText === chunk.text)).toBe(
    true,
  );
  expect(index.stats?.contextFailures).toBe(0);
});

test("a failed embedding deletes the chunks and marks the index failed", async () => {
  const chunks = new MemoryRagChunks();
  const { builder, indexes } = setup({
    chunks,
    embeddings: { embed: async () => ({ vectors: [[0, 0, 0]], usage: null }) },
  });

  const error = await rejectionOf(builder.build(plain));

  expect(error instanceof EmbeddingError).toBe(true);
  expect(chunks.events).toEqual(["deleteByIndex"]);
  expect(indexes.events).toEqual(["create", "markFailed"]);
  expect(indexes.rows[0]?.state).toBe("failed");
  expect(indexes.rows[0]?.error).toBe((error as Error).message);
});

test("a zero vector fails the build before any chunk is stored", async () => {
  const { builder, indexes, chunks } = setup({
    embeddings: {
      embed: async (input) => ({ vectors: input.texts.map(() => [0, 0]), usage: null }),
    },
  });

  expect((await rejectionOf(builder.build(plain))) instanceof EmbeddingError).toBe(true);
  expect(chunks.rows).toEqual([]);
  expect(indexes.rows[0]?.state).toBe("failed");
});

test("an index deleted during the build is not left with chunks", async () => {
  const { builder, indexes, chunks } = setup();
  const job = await builder.start(plain);
  indexes.rows = [];

  expect((await rejectionOf(job.run())) instanceof IndexBuildError).toBe(true);
  expect(chunks.rows).toEqual([]);
});

test("start creates the building index and run fills it once", async () => {
  const { builder, indexes } = setup();

  const job = await builder.start(plain);
  expect(job.index.state).toBe("building");
  expect(indexes.events).toEqual(["create"]);

  expect((await job.run()).state).toBe("ready");
  expect((await rejectionOf(job.run())) instanceof IndexBuildError).toBe(true);
});

test("nothing is created without a published CV or with an invalid config", async () => {
  const empty = setup({ corpus: null });
  expect((await rejectionOf(empty.builder.build(plain))) instanceof IndexBuildError).toBe(true);
  expect(empty.indexes.rows).toEqual([]);

  const invalid = setup();
  const error = await rejectionOf(invalid.builder.build({ ...plain, contextModel: "m" }));
  expect(error instanceof InvalidIndexConfigError).toBe(true);
  expect(invalid.indexes.rows).toEqual([]);
});

test("a chunker that returns nothing fails the build", async () => {
  const none: Chunker = { chunk: () => [] };
  const { builder, indexes } = setup({ chunkers: { structured: none, "token-window": none } });

  expect((await rejectionOf(builder.build(plain))) instanceof IndexBuildError).toBe(true);
  expect(indexes.rows[0]?.state).toBe("failed");
  expect(indexes.rows[0]?.error).toBe("The CV produced no chunks.");
});
