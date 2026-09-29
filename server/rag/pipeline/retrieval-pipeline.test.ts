import { expect, test } from "bun:test";

import type { EmbeddingClient } from "@/server/domain/llm";
import {
  NoActiveRagIndexError,
  RagIndexNotFoundError,
  RagIndexStateError,
  RetrievalError,
  type Chunk,
  type LexicalSearchOptions,
  type RagIndex,
  type RankedHit,
  type RerankCandidate,
  type Reranker,
  type RerankOutcome,
  type RetrievalConfig,
  type RetrievalRequest,
  type Retriever,
  type RewriteInput,
  type RewriteResult,
} from "@/server/domain/rag";
import { MemoryRagIndexes } from "@/server/rag/__fixtures__/memory-rag-repositories";
import { DEFAULT_RETRIEVAL_CONFIG, RETRIEVAL_PRESETS } from "@/server/rag/pipeline/retrieval-config";
import { RetrievalPipeline } from "@/server/rag/pipeline/retrieval-pipeline";
import type {
  FilterStageOutput,
  FuseStageOutput,
  RerankStageOutput,
  SearchStageOutput,
} from "@/server/rag/pipeline/trace-stages";

const at = "2026-09-29T08:00:00.000Z";

function chunk(id: string, title: string): Chunk {
  return {
    id,
    indexId: "index-1",
    ordinal: Number(id.slice(1)),
    section: "experience",
    title,
    entityKeys: [`experience:${id}`],
    text: `${title} text`,
    context: `${title} context`,
    indexText: `${title} context\n\n${title} text`,
    tokenCount: 10,
  };
}

const CHUNKS = [
  chunk("c1", "Acme"),
  chunk("c2", "Globex"),
  chunk("c3", "Initech"),
  chunk("c4", "Umbrella"),
  chunk("c5", "Hooli"),
];

function hits(...ids: string[]): RankedHit[] {
  return ids.map((chunkId, index) => ({ chunkId, rank: index + 1, score: 1 - index / 10 }));
}

// Vector search answers by the first number of the query vector, which the fake embedder
// sets to the query's position in `QUERY_VECTORS`.
const QUERY_VECTORS = ["Where did Jane work?", "Jane Doe employers", "Jane Doe companies"];

class FakeEmbeddings implements EmbeddingClient {
  calls: { model: string; texts: string[] }[] = [];

  async embed(input: { model: string; texts: string[] }) {
    this.calls.push(input);
    return { vectors: input.texts.map((text) => [QUERY_VECTORS.indexOf(text) + 1, 1]), usage: null };
  }
}

class FakeRetriever implements Retriever {
  calls: string[] = [];
  lexicalOptions: (LexicalSearchOptions | undefined)[] = [];

  constructor(
    private readonly vector: Record<number, RankedHit[]>,
    private readonly lexical: Record<string, RankedHit[]>,
  ) {}

  async searchLexical(_indexId: string, query: string, k: number, options?: LexicalSearchOptions) {
    this.calls.push(`lexical:${query}:${k}`);
    this.lexicalOptions.push(options);
    return (this.lexical[query] ?? []).slice(0, k);
  }

  async searchVector(_indexId: string, vector: readonly number[], k: number) {
    this.calls.push(`vector:${vector[0]}:${k}`);
    return (this.vector[vector[0] ?? 0] ?? []).slice(0, k);
  }

  async getChunks(_indexId: string, ids: readonly string[]) {
    this.calls.push(`chunks:${ids.join(",")}`);
    return ids.flatMap((id) => CHUNKS.filter((entry) => entry.id === id));
  }
}

class FakeRewriter {
  inputs: RewriteInput[] = [];

  constructor(private readonly reply: Omit<RewriteResult, "raw">) {}

  async rewrite(input: RewriteInput): Promise<RewriteResult> {
    this.inputs.push(input);
    return { ...this.reply, raw: { standalone: this.reply.queries[0] } };
  }
}

// Reverses the candidates and scores them 0.9, 0.8, ...
class FakeReranker implements Reranker {
  calls: { query: string; candidates: readonly RerankCandidate[]; topN: number }[] = [];

  constructor(private readonly override?: Partial<RerankOutcome>) {}

  async rerank(query: string, candidates: readonly RerankCandidate[], topN: number) {
    this.calls.push({ query, candidates, topN });
    const hits = [...candidates]
      .reverse()
      .slice(0, topN)
      .map((candidate, index) => ({ chunkId: candidate.chunkId, score: (9 - index) / 10 }));
    return { hits, fallback: false, error: null, ...this.override };
  }
}

function readyIndex(id: string, active: boolean, embeddingModel = "index-embed"): RagIndex {
  return {
    id,
    sourceType: "cv",
    sourceId: "cv-1",
    config: { chunker: "structured", contextualize: true, embeddingModel, contextModel: "ctx" },
    state: "ready",
    active,
    error: null,
    stats: null,
    createdAt: at,
    finishedAt: at,
  };
}

function setup(
  options: {
    rewrite?: Omit<RewriteResult, "raw">;
    reranker?: Reranker;
    retriever?: Retriever;
    embeddings?: EmbeddingClient;
  } = {},
) {
  const indexes = new MemoryRagIndexes();
  indexes.rows.push(readyIndex("index-1", true), readyIndex("index-2", false, "other-embed"));
  const embeddings = new FakeEmbeddings();
  const retriever = new FakeRetriever(
    { 1: hits("c1", "c2", "c3"), 2: hits("c4", "c1") },
    { "Where did Jane work?": hits("c3", "c5"), "Jane Doe employers": hits("c2") },
  );
  const rewriter = new FakeRewriter(
    options.rewrite ?? { queries: ["Where did Jane work?"], scope: "cv" },
  );
  const reranker = new FakeReranker();
  let tick = 0;
  const pipeline = new RetrievalPipeline({
    indexes,
    retriever: options.retriever ?? retriever,
    rewriter,
    reranker: options.reranker ?? reranker,
    embeddings: options.embeddings ?? embeddings,
    now: () => new Date(at),
    clock: () => (tick += 5),
    newTraceId: () => "trace-1",
  });
  return { pipeline, indexes, embeddings, retriever, rewriter, reranker };
}

function request(config: Partial<RetrievalConfig> = {}, extra: Partial<RetrievalRequest> = {}) {
  return {
    message: "Where did she work?",
    history: [{ role: "user" as const, text: "Tell me about Jane." }],
    config: { ...DEFAULT_RETRIEVAL_CONFIG, ...config },
    subjectName: "Jane Doe",
    kind: "playground" as const,
    ...extra,
  };
}

function stageNames(result: { trace: { stages: { name: string }[] } }) {
  return result.trace.stages.map((stage) => stage.name);
}

function outputOf<T>(result: { trace: { stages: { name: string; output: unknown }[] } }, name: string) {
  return result.trace.stages.find((stage) => stage.name === name)?.output as T;
}

async function rejection(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

test("the default config runs every stage in order against the active index", async () => {
  const { pipeline, rewriter } = setup();

  const result = await pipeline.run(request());

  expect(stageNames(result)).toEqual([
    "rewrite",
    "embed-queries",
    "vector-search",
    "lexical-search",
    "fuse",
    "rerank",
    "filter",
  ]);
  expect(rewriter.inputs).toEqual([
    {
      message: "Where did she work?",
      history: [{ role: "user", text: "Tell me about Jane." }],
      mode: "standalone",
      subjectName: "Jane Doe",
    },
  ]);
  expect(result.scope).toBe("cv");
  expect(result.queries).toEqual(["Where did Jane work?"]);
  expect(result.trace).toMatchObject({
    id: "trace-1",
    kind: "playground",
    indexId: "index-1",
    config: DEFAULT_RETRIEVAL_CONFIG,
    createdAt: at,
  });
});

test("queries are embedded once with the index's embedding model", async () => {
  const { pipeline, embeddings } = setup({
    rewrite: { queries: ["Where did Jane work?", "Jane Doe employers"], scope: "cv" },
  });

  await pipeline.run(request({ rewrite: "multi" }));
  await pipeline.run(request({ rewrite: "multi" }, { indexId: "index-2" }));

  expect(embeddings.calls).toEqual([
    { model: "index-embed", texts: ["Where did Jane work?", "Jane Doe employers"] },
    { model: "other-embed", texts: ["Where did Jane work?", "Jane Doe employers"] },
  ]);
});

test("every query is searched both ways and the lists are fused by name", async () => {
  const { pipeline, retriever } = setup({
    rewrite: { queries: ["Where did Jane work?", "Jane Doe employers"], scope: "cv" },
  });

  const result = await pipeline.run(request({ rewrite: "multi", candidatesPerSearch: 7 }));

  expect(retriever.calls.filter((call) => !call.startsWith("chunks:"))).toEqual([
    "vector:1:7",
    "vector:2:7",
    "lexical:Where did Jane work?:7",
    "lexical:Jane Doe employers:7",
  ]);
  const vector = outputOf<SearchStageOutput>(result, "vector-search");
  expect(vector.lists.map((list) => [list.name, list.query])).toEqual([
    ["vector:q0", "Where did Jane work?"],
    ["vector:q1", "Jane Doe employers"],
  ]);
  expect(vector.lists[0]?.hits[0]).toEqual({
    chunkId: "c1",
    rank: 1,
    score: 1,
    title: "Acme",
    section: "experience",
    entityKeys: ["experience:c1"],
  });

  const fuse = result.trace.stages.find((stage) => stage.name === "fuse");
  expect(fuse?.input).toEqual({
    lists: ["vector:q0", "vector:q1", "bm25:q0", "bm25:q1"],
    k: 60,
    limit: 20,
  });
  const fused = outputOf<FuseStageOutput>(result, "fuse");
  // c1: vector:q0#1 + vector:q1#2; c2: vector:q0#2 + bm25:q1#1; c3: vector:q0#3 + bm25:q0#1.
  expect(fused.hits.map((hit) => hit.chunkId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  expect(fused.hits[0]?.contributions).toEqual([
    { list: "vector:q0", rank: 1 },
    { list: "vector:q1", rank: 2 },
  ]);
  expect(fused.hits[0]?.score).toBeCloseTo(1 / 61 + 1 / 62, 12);
  expect(fused.total).toBe(5);
});

test("BM25 ignores the subject's name by default and records it in the trace", async () => {
  const { pipeline, retriever } = setup({
    rewrite: { queries: ["Where did Jane work?", "Jane Doe employers"], scope: "cv" },
  });

  const result = await pipeline.run(request({ rewrite: "multi" }));

  expect(retriever.lexicalOptions).toEqual([
    { ignoreTermsOf: "Jane Doe" },
    { ignoreTermsOf: "Jane Doe" },
  ]);
  expect(outputOf<SearchStageOutput>(result, "lexical-search").ignoredTermsOf).toBe("Jane Doe");
  expect(outputOf<SearchStageOutput>(result, "vector-search")).not.toHaveProperty("ignoredTermsOf");
});

test("with ignoreSubjectInLexical off, BM25 searches the full query", async () => {
  const { pipeline, retriever } = setup();

  const result = await pipeline.run(request({ ignoreSubjectInLexical: false }));

  expect(retriever.lexicalOptions).toEqual([{ ignoreTermsOf: undefined }]);
  expect(outputOf<SearchStageOutput>(result, "lexical-search")).not.toHaveProperty(
    "ignoredTermsOf",
  );
});

test("chunks are fetched once per id across the searches", async () => {
  const { pipeline, retriever } = setup();

  await pipeline.run(request());

  expect(retriever.calls.filter((call) => call.startsWith("chunks:"))).toEqual([
    "chunks:c1,c2,c3",
    "chunks:c5",
  ]);
});

test("reranking reads queries[0] and index texts, and the final chunks get source ids", async () => {
  const { pipeline, reranker } = setup({
    rewrite: { queries: ["Where did Jane work?", "Jane Doe employers"], scope: "cv" },
  });

  const result = await pipeline.run(request({ rewrite: "multi", finalK: 3, dropBelowMeanRerank: false }));

  expect(reranker.calls.length).toBe(1);
  expect(reranker.calls[0]?.query).toBe("Where did Jane work?");
  expect(reranker.calls[0]?.topN).toBe(3);
  expect(reranker.calls[0]?.candidates.map((candidate) => candidate.text)).toEqual(
    ["c1", "c2", "c3", "c4", "c5"].map((id) => CHUNKS.find((entry) => entry.id === id)?.indexText),
  );

  expect(result.chunks.map((entry) => [entry.sourceId, entry.id, entry.rerankScore])).toEqual([
    ["S1", "c5", 0.9],
    ["S2", "c4", 0.8],
    ["S3", "c3", 0.7],
  ]);
  const rerank = outputOf<RerankStageOutput>(result, "rerank");
  expect(rerank.hits.map((hit) => [hit.chunkId, hit.fusedRank, hit.rank])).toEqual([
    ["c5", 5, 1],
    ["c4", 4, 2],
    ["c3", 3, 3],
  ]);
  const fused = outputOf<FuseStageOutput>(result, "fuse");
  expect(result.chunks[0]?.fusedScore).toBe(fused.hits[4]?.score ?? -1);
  expect(result.trace.sources.map((source) => [source.sourceId, source.chunkId, source.text])).toEqual([
    ["S1", "c5", "Hooli text"],
    ["S2", "c4", "Umbrella text"],
    ["S3", "c3", "Initech text"],
  ]);
});

test("the reranker gets the query without the subject's name by default, and the trace says so", async () => {
  const { pipeline, reranker } = setup({ rewrite: { queries: ["Jane Doe employers"], scope: "cv" } });

  const result = await pipeline.run(request());

  expect(reranker.calls[0]?.query).toBe("employers");
  const stage = result.trace.stages.find((entry) => entry.name === "rerank");
  expect(stage?.input).toEqual({ query: "employers", candidates: 3, topN: 5 });
  expect(outputOf<RerankStageOutput>(result, "rerank").ignoredName).toBe("Jane Doe");
});

test("the reranker gets index texts without the subject's name, and the sources keep it", async () => {
  const { pipeline, reranker } = setup();

  // "Acme" stands in for the name so a fixture chunk contains it.
  const result = await pipeline.run(request({ dropBelowMeanRerank: false }, { subjectName: "Acme" }));

  const texts = new Map(reranker.calls[0]?.candidates.map((candidate) => [candidate.chunkId, candidate.text]));
  expect(texts.get("c1")).toBe("context\n\ntext");
  expect(texts.get("c2")).toBe(CHUNKS[1]?.indexText);
  expect(result.trace.sources.find((source) => source.chunkId === "c1")?.text).toBe("Acme text");
});

test("with ignoreSubjectInRerank off, the reranker gets the full query and texts", async () => {
  const { pipeline, reranker } = setup({ rewrite: { queries: ["Jane Doe employers"], scope: "cv" } });

  const result = await pipeline.run(request({ ignoreSubjectInRerank: false }));
  const acme = setup();
  await acme.pipeline.run(request({ ignoreSubjectInRerank: false }, { subjectName: "Acme" }));

  expect(reranker.calls[0]?.query).toBe("Jane Doe employers");
  expect(outputOf<RerankStageOutput>(result, "rerank")).not.toHaveProperty("ignoredName");
  expect(acme.reranker.calls[0]?.candidates.find((candidate) => candidate.chunkId === "c1")?.text).toBe(
    CHUNKS[0]?.indexText,
  );
});

test("the fused list is cut to fusedLimit before reranking", async () => {
  const { pipeline, reranker } = setup();

  const result = await pipeline.run(request({ fusedLimit: 2 }));

  // Fused: c3 (vector #3 + bm25 #1), c1, then c2 and c5 tie and go by id.
  expect(reranker.calls[0]?.candidates.map((candidate) => candidate.chunkId)).toEqual(["c3", "c1"]);
  expect(outputOf<FuseStageOutput>(result, "fuse").total).toBe(4);
});

test("lexical-only skips embedding and vector search, and without rerank takes the top finalK", async () => {
  const { pipeline, embeddings, reranker } = setup();

  const result = await pipeline.run(request({ ...RETRIEVAL_PRESETS["lexical-only"], finalK: 1 }));

  expect(stageNames(result)).toEqual(["rewrite", "lexical-search", "fuse"]);
  expect(embeddings.calls.length).toBe(0);
  expect(reranker.calls.length).toBe(0);
  expect(result.chunks.map((entry) => [entry.sourceId, entry.id, entry.rerankScore])).toEqual([
    ["S1", "c3", null],
  ]);
  expect(result.chunks[0]?.fusedScore).toBeCloseTo(1 / 61, 12);
});

test("vector-only fuses its single list without changing the order", async () => {
  const { pipeline, retriever } = setup();

  const result = await pipeline.run(request(RETRIEVAL_PRESETS["vector-only"]));

  expect(stageNames(result)).toEqual(["rewrite", "embed-queries", "vector-search", "fuse"]);
  expect(retriever.calls.some((call) => call.startsWith("lexical:"))).toBe(false);
  expect(result.chunks.map((entry) => entry.id)).toEqual(["c1", "c2", "c3"]);
});

test("the filter drops reranked hits below minRerankScore and records them", async () => {
  const { pipeline } = setup();

  const result = await pipeline.run(request({ minRerankScore: 0.75, dropBelowMeanRerank: false }));

  expect(result.chunks.map((entry) => [entry.sourceId, entry.id])).toEqual([
    ["S1", "c5"],
    ["S2", "c2"],
  ]);
  const filter = outputOf<FilterStageOutput>(result, "filter");
  expect(filter.minRerankScore).toBe(0.75);
  expect(filter.kept).toBe(2);
  expect(filter.dropped.map((hit) => [hit.chunkId, hit.rank])).toEqual([
    ["c1", 3],
    ["c3", 4],
  ]);
});

test("by default the filter also drops reranked hits below their mean and records the mean", async () => {
  const { pipeline } = setup();

  // The reranker scores the four candidates 0.9, 0.8, 0.7, 0.6: mean 0.75.
  const result = await pipeline.run(request());

  expect(result.chunks.map((entry) => entry.rerankScore)).toEqual([0.9, 0.8]);
  const filter = outputOf<FilterStageOutput>(result, "filter");
  expect(filter.meanRerankScore).toBeCloseTo(0.75, 12);
  expect(filter.dropped.map((hit) => hit.score)).toEqual([0.7, 0.6]);
  const stage = result.trace.stages.find((entry) => entry.name === "filter");
  expect(stage?.input).toEqual({ minRerankScore: 0, dropBelowMean: true, hits: 4 });
});

test("a hit must pass both the mean and minRerankScore", async () => {
  const { pipeline } = setup();

  const result = await pipeline.run(request({ minRerankScore: 0.85 }));

  expect(result.chunks.map((entry) => entry.rerankScore)).toEqual([0.9]);
  expect(outputOf<FilterStageOutput>(result, "filter").dropped.length).toBe(3);
});

test("equal rerank scores are all kept by the mean cut", async () => {
  const reranker = new FakeReranker({
    hits: ["c1", "c2", "c3"].map((chunkId) => ({ chunkId, score: 0.1 })),
  });
  const { pipeline } = setup({ reranker });

  const result = await pipeline.run(request());

  // 0.1 * 3 / 3 is 0.10000000000000002 in floats, just above every score.
  expect(result.chunks.map((entry) => entry.id)).toEqual(["c1", "c2", "c3"]);
  expect(outputOf<FilterStageOutput>(result, "filter").dropped).toEqual([]);
});

test("with dropBelowMeanRerank off, the filter keeps every hit and records no mean", async () => {
  const { pipeline } = setup();

  const result = await pipeline.run(request({ dropBelowMeanRerank: false }));

  expect(result.chunks.length).toBe(4);
  expect(outputOf<FilterStageOutput>(result, "filter")).not.toHaveProperty("meanRerankScore");
});

test("a reranker fallback keeps the fused order, has no rerank scores and skips the filter", async () => {
  const fallback = new FakeReranker({
    hits: [
      { chunkId: "c1", score: 1 },
      { chunkId: "c3", score: 0.5 },
    ],
    fallback: true,
    error: "provider down",
  });
  const { pipeline } = setup({ reranker: fallback });

  const result = await pipeline.run(request({ minRerankScore: 0.9 }));

  expect(stageNames(result).includes("filter")).toBe(false);
  expect(result.chunks.map((entry) => [entry.id, entry.rerankScore])).toEqual([
    ["c1", null],
    ["c3", null],
  ]);
  expect(outputOf<RerankStageOutput>(result, "rerank")).toMatchObject({
    fallback: true,
    error: "provider down",
  });
});

test("an off-topic message stops after the rewrite and returns no chunks", async () => {
  const { pipeline, embeddings, retriever, reranker } = setup({
    rewrite: { queries: ["What is the weather?"], scope: "off_topic" },
  });

  const result = await pipeline.run(request());

  expect(stageNames(result)).toEqual(["rewrite"]);
  expect(result.chunks).toEqual([]);
  expect(result.scope).toBe("off_topic");
  expect(result.trace.sources).toEqual([]);
  expect(embeddings.calls.length + retriever.calls.length + reranker.calls.length).toBe(0);
});

test("smalltalk still retrieves", async () => {
  const { pipeline } = setup({ rewrite: { queries: ["Where did Jane work?"], scope: "smalltalk" } });

  const result = await pipeline.run(request());

  expect(result.scope).toBe("smalltalk");
  expect(result.chunks.length).toBeLessThanOrEqual(5);
  expect(stageNames(result).length).toBe(7);
});

test("the trace timing comes from the injected clock", async () => {
  const { pipeline } = setup();

  const result = await pipeline.run(request(RETRIEVAL_PRESETS["lexical-only"]));

  // Clock reads: origin 5, then start/end 10/15, 20/25, 30/35, and 40 for the total.
  expect(result.trace.stages.map((stage) => [stage.startedAt, stage.durationMs])).toEqual([
    [5, 5],
    [15, 5],
    [25, 5],
  ]);
  expect(result.trace.totalMs).toBe(35);
});

test("a failing stage throws RetrievalError with the partial trace", async () => {
  const failing: EmbeddingClient = {
    embed: async () => {
      throw new Error("embedding provider down");
    },
  };
  const { pipeline } = setup({ embeddings: failing });

  const error = await rejection(pipeline.run(request()));

  if (!(error instanceof RetrievalError)) throw new Error("expected a RetrievalError");
  expect(error.stage).toBe("embed-queries");
  expect(error.message).toBe("Retrieval failed at the embed-queries stage.");
  expect(error.trace.stages.map((stage) => [stage.name, stage.error])).toEqual([
    ["rewrite", null],
    ["embed-queries", "embedding provider down"],
  ]);
  expect(error.trace.sources).toEqual([]);
});

test("the request's observer hears each executed stage start and end, in pipeline order", async () => {
  const { pipeline } = setup();
  const calls: string[] = [];

  const result = await pipeline.run(
    request(RETRIEVAL_PRESETS["lexical-only"], {
      observer: {
        stageStarted: (name, startedAt) => calls.push(`start:${name}@${startedAt}`),
        stageEnded: (stage) => calls.push(`end:${stage.name}+${stage.durationMs}`),
      },
    }),
  );

  expect(calls).toEqual([
    "start:rewrite@5",
    "end:rewrite+5",
    "start:lexical-search@15",
    "end:lexical-search+5",
    "start:fuse@25",
    "end:fuse+5",
  ]);
  expect(stageNames(result)).toEqual(["rewrite", "lexical-search", "fuse"]);
});

test("the observer hears a failed stage end before the run throws", async () => {
  const failing: EmbeddingClient = {
    embed: async () => {
      throw new Error("embedding provider down");
    },
  };
  const { pipeline } = setup({ embeddings: failing });
  const ended: [string, string | null][] = [];

  await rejection(
    pipeline.run(
      request({}, {
        observer: {
          stageStarted: () => undefined,
          stageEnded: (stage) => ended.push([stage.name, stage.error]),
        },
      }),
    ),
  );

  expect(ended).toEqual([
    ["rewrite", null],
    ["embed-queries", "embedding provider down"],
  ]);
});

test("the index must exist, be ready, and default to the active one", async () => {
  const { pipeline, indexes } = setup();

  expect((await rejection(pipeline.run(request({}, { indexId: "missing" })))) instanceof
    RagIndexNotFoundError).toBe(true);

  indexes.rows.push({ ...readyIndex("index-3", false), state: "building" });
  expect((await rejection(pipeline.run(request({}, { indexId: "index-3" })))) instanceof
    RagIndexStateError).toBe(true);

  for (const row of indexes.rows) row.active = false;
  expect((await rejection(pipeline.run(request()))) instanceof NoActiveRagIndexError).toBe(true);
});
