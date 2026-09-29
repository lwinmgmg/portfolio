import { expect, test } from "bun:test";

import { CHAT_STEP_HITS, type ChatStep } from "@/server/domain/chat";
import type { EmbeddingClient } from "@/server/domain/llm";
import type {
  EmbeddedChunk,
  RagIndex,
  RerankCandidate,
  Reranker,
  RerankOutcome,
  RetrievalConfig,
  RetrievalResult,
  RewriteResult,
  TraceObserver,
  TraceStage,
} from "@/server/domain/rag";
import {
  MemoryRagChunks,
  MemoryRagIndexes,
} from "@/server/rag/__fixtures__/memory-rag-repositories";
import { sampleCorpus } from "@/server/rag/__fixtures__/sample-corpus";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import { composeIndexText } from "@/server/rag/contextualize/index-text";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import { RetrievalPipeline } from "@/server/rag/pipeline/retrieval-pipeline";
import {
  finishedStep,
  isChatStepName,
  runningStep,
} from "@/server/rag/progress/chat-steps";
import { InMemoryRetriever } from "@/server/rag/search/in-memory-retriever";

// Values that must never reach a visitor. Each is planted where the pipeline keeps it.
const EMBED_MODEL = "secret-embed-model";
const RAW_SECRET = "raw-rewrite-note";
const REWRITE_ERROR = "rewrite provider said 503";
const RERANK_ERROR = "rerank provider said 429";
const EMBED_ERROR = "embedding provider down";

const DIMENSIONS = 16;

// A bag-of-letters vector: texts that share words point the same way.
function embed(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const char of text.toLowerCase()) {
    const code = char.charCodeAt(0);
    if (code >= 97 && code <= 122) vector[code % DIMENSIONS] += 1;
  }
  return vector;
}

class FakeEmbeddings implements EmbeddingClient {
  constructor(private readonly failure: string | null = null) {}

  async embed(input: { model: string; texts: string[] }) {
    if (this.failure) throw new Error(this.failure);
    return { vectors: input.texts.map(embed), usage: null };
  }
}

// Reverses the candidates and scores them 0.9, 0.8, ...
class ReversingReranker implements Reranker {
  constructor(private readonly override: Partial<RerankOutcome> = {}) {}

  async rerank(_query: string, candidates: readonly RerankCandidate[], topN: number) {
    const hits = [...candidates]
      .reverse()
      .slice(0, topN)
      .map((candidate, index) => ({ chunkId: candidate.chunkId, score: (9 - index) / 10 }));
    return { hits, fallback: false, error: null, ...this.override };
  }
}

function sampleChunks(): EmbeddedChunk[] {
  const chunks = new StructuredCvChunker().chunk(sampleCorpus);
  return chunks.map((draft) => {
    const context = `Context note ${draft.ordinal} about Jane.`;
    const indexText = composeIndexText(context, draft.text);
    return { ...draft, id: `index-1:${draft.ordinal}`, indexId: "index-1", context, indexText, embedding: embed(indexText) };
  });
}

function readyIndex(): RagIndex {
  return {
    id: "index-1",
    sourceType: "cv",
    sourceId: "cv-1",
    config: { chunker: "structured", contextualize: true, embeddingModel: EMBED_MODEL, contextModel: "ctx" },
    state: "ready",
    active: true,
    error: null,
    stats: null,
    createdAt: "2026-09-29T08:00:00.000Z",
    finishedAt: "2026-09-29T08:00:00.000Z",
  };
}

// Collects the steps an observer would stream, as the chat service will.
class StepCollector implements TraceObserver {
  steps: ChatStep[] = [];

  stageStarted(name: string, startedAt: number): void {
    if (isChatStepName(name)) this.steps.push(runningStep(name, startedAt));
  }

  stageEnded(stage: TraceStage): void {
    const step = finishedStep(stage);
    if (step) this.steps.push(step);
  }
}

type RunOptions = {
  config?: Partial<RetrievalConfig>;
  rewrite?: RewriteResult;
  reranker?: Reranker;
  embeddings?: EmbeddingClient;
};

async function run(options: RunOptions = {}): Promise<{ steps: ChatStep[]; result: RetrievalResult | null }> {
  const indexes = new MemoryRagIndexes();
  indexes.rows.push(readyIndex());
  const chunks = new MemoryRagChunks();
  chunks.rows.push(...sampleChunks());
  const rewrite = options.rewrite ?? {
    queries: ["Jane Doe work at Acme", "Jane Doe TypeScript platform"],
    scope: "cv",
    raw: { standalone: "Jane Doe work at Acme", note: RAW_SECRET },
  };
  let tick = 0;
  const pipeline = new RetrievalPipeline({
    indexes,
    retriever: new InMemoryRetriever(chunks),
    rewriter: { rewrite: async () => rewrite },
    router: {
      model: "router-model",
      route: async () => {
        throw new Error("not asked with the rewriter as scope router");
      },
    },
    reranker: options.reranker ?? new ReversingReranker(),
    embeddings: options.embeddings ?? new FakeEmbeddings(),
    // Fractional milliseconds, like performance.now().
    clock: () => (tick += 2.4),
  });
  const collector = new StepCollector();
  const result = await pipeline
    .run({
      message: "Where does she work?",
      history: [],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, rewrite: "multi", minRerankScore: 0.75, ...options.config },
      subjectName: "Jane Doe",
      kind: "chat",
      observer: collector,
    })
    .catch(() => null);
  return { steps: collector.steps, result };
}

function detailOf<K extends NonNullable<ChatStep["detail"]>["kind"]>(steps: ChatStep[], kind: K) {
  const detail = steps.find((step) => step.detail?.kind === kind)?.detail;
  if (!detail || detail.kind !== kind) throw new Error(`no ${kind} detail`);
  return detail as Extract<NonNullable<ChatStep["detail"]>, { kind: K }>;
}

test("a pipeline run gives one running and one finished step per stage, in pipeline order", async () => {
  const { steps, result } = await run();

  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    "rewrite:running",
    "rewrite:done",
    "embed-queries:running",
    "embed-queries:done",
    "vector-search:running",
    "vector-search:done",
    "lexical-search:running",
    "lexical-search:done",
    "fuse:running",
    "fuse:done",
    "rerank:running",
    "rerank:done",
    "filter:running",
    "filter:done",
  ]);
  const running = steps.filter((step) => step.status === "running");
  expect(running.every((step) => step.durationMs === null && step.detail === null)).toBe(true);

  // Timings match the trace, in whole milliseconds.
  const finished = steps.filter((step) => step.status === "done");
  expect(finished.map((step) => [step.startedAt, step.durationMs])).toEqual(
    (result?.trace.stages ?? []).map((stage) => [Math.round(stage.startedAt), Math.round(stage.durationMs)]),
  );
  expect(running.map((step) => step.startedAt)).toEqual(finished.map((step) => step.startedAt));
});

test("every stage kind is projected from real pipeline output over the sample CV", async () => {
  const { steps, result } = await run();
  if (!result) throw new Error("the run failed");
  const chunkCount = sampleChunks().length;

  expect(detailOf(steps, "rewrite")).toEqual({
    kind: "rewrite",
    queries: ["Jane Doe work at Acme", "Jane Doe TypeScript platform"],
    scope: "cv",
    fallback: false,
  });
  expect(detailOf(steps, "embed")).toEqual({ kind: "embed", count: 2, dimensions: DIMENSIONS });

  const [vector, lexical] = steps.filter((step) => step.detail?.kind === "search").map((step) => step.detail);
  if (vector?.kind !== "search" || lexical?.kind !== "search") throw new Error("expected searches");
  expect(vector.method).toBe("vector");
  expect(lexical.method).toBe("bm25");
  expect(vector.lists.map((list) => [list.query, list.total])).toEqual([
    ["Jane Doe work at Acme", chunkCount],
    ["Jane Doe TypeScript platform", chunkCount],
  ]);
  expect(lexical.lists.map((list) => list.query)).toEqual(["Jane Doe work at Acme", "Jane Doe TypeScript platform"]);
  const acmeChunk = sampleChunks().find((chunk) => chunk.title.includes("Acme"));
  const top = lexical.lists[0]?.hits[0];
  expect(top).toEqual({
    rank: 1,
    score: top?.score ?? -1,
    title: acmeChunk?.title ?? "",
    section: "experience",
    anchor: `#experience-${acmeChunk?.entityKeys[0]?.split(":")[1]}`,
  });

  const fuse = detailOf(steps, "fuse");
  expect(fuse.total).toBe(chunkCount);
  expect(fuse.hits[0]?.contributions.map((entry) => entry.list)).toContain("bm25:q0");

  const rerank = detailOf(steps, "rerank");
  expect(rerank.fallback).toBe(false);
  // The reranker reverses the fused list, so its first hit was fused last.
  const fusedCount = Math.min(chunkCount, DEFAULT_RETRIEVAL_CONFIG.fusedLimit);
  expect(rerank.hits.map((hit) => [hit.rank, hit.score, hit.fusedRank])).toEqual([
    [1, 0.9, fusedCount],
    [2, 0.8, fusedCount - 1],
    [3, 0.7, fusedCount - 2],
    [4, 0.6, fusedCount - 3],
    [5, 0.5, fusedCount - 4],
  ]);

  const filter = detailOf(steps, "filter");
  expect(filter).toMatchObject({ kind: "filter", minScore: 0.75, kept: 2 });
  expect(filter.dropped.map((hit) => [hit.rank, hit.score])).toEqual([
    [3, 0.7],
    [4, 0.6],
    [5, 0.5],
  ]);
  expect(result.chunks.length).toBe(2);

  const anchors = steps.flatMap((step) =>
    step.detail?.kind === "search" ? step.detail.lists.flatMap((list) => list.hits.map((hit) => hit.anchor)) : [],
  );
  expect(anchors.every((anchor) => anchor === null || anchor.startsWith("#"))).toBe(true);
});

test("fallbacks show only as flags, without their messages", async () => {
  const { steps } = await run({
    rewrite: { queries: ["Where does she work?"], scope: "cv", raw: REWRITE_ERROR },
    reranker: new ReversingReranker({ fallback: true, error: RERANK_ERROR }),
  });

  expect(detailOf(steps, "rewrite")).toEqual({
    kind: "rewrite",
    queries: ["Where does she work?"],
    scope: "cv",
    fallback: true,
  });
  expect(detailOf(steps, "rerank").fallback).toBe(true);
  // A fallback skips the filter.
  expect(steps.some((step) => step.name === "filter")).toBe(false);
  const json = JSON.stringify(steps);
  expect(json).not.toContain(REWRITE_ERROR);
  expect(json).not.toContain(RERANK_ERROR);
});

test("an off-topic run stops after the rewrite, whose detail shows the scope", async () => {
  const { steps } = await run({ rewrite: { queries: ["weather"], scope: "off_topic", raw: {} } });

  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual(["rewrite:running", "rewrite:done"]);
  expect(detailOf(steps, "rewrite").scope).toBe("off_topic");
});

test("a failed stage is a failed step with no detail and no error text", async () => {
  const { steps, result } = await run({ embeddings: new FakeEmbeddings(EMBED_ERROR) });

  expect(result).toBe(null);
  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    "rewrite:running",
    "rewrite:done",
    "embed-queries:running",
    "embed-queries:failed",
  ]);
  expect(steps.at(-1)?.detail).toBe(null);
  expect(steps.at(-1)?.durationMs).not.toBe(null);
  expect(JSON.stringify(steps)).not.toContain(EMBED_ERROR);
});

test("no chunk text, context, raw output, model or error text reaches a step", async () => {
  const runs = await Promise.all([
    run(),
    run({ reranker: new ReversingReranker({ fallback: true, error: RERANK_ERROR }) }),
    run({ config: { rerank: false } }),
  ]);
  const json = JSON.stringify(runs.flatMap((entry) => entry.steps));

  for (const chunk of sampleChunks()) {
    expect(json).not.toContain(JSON.stringify(chunk.text).slice(1, -1));
    expect(json).not.toContain(chunk.context ?? "no context");
  }
  for (const secret of [EMBED_MODEL, RAW_SECRET, RERANK_ERROR]) expect(json).not.toContain(secret);
  const keys = ["chunkId", "entityKeys", "text", "context", "indexText", "raw", "model", "error", "usage", "ignoredTermsOf", "ignoredName"];
  for (const key of keys) {
    expect(json).not.toContain(`"${key}":`);
  }
});

function tracedHits(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    chunkId: `c${index}`,
    rank: index + 1,
    score: 1 - index / 100,
    title: `Job ${index}`,
    section: "experience",
    entityKeys: [`experience:job-${index}`],
  }));
}

function stage(name: string, output: unknown, extra: Partial<TraceStage> = {}): TraceStage {
  return { name, input: null, output, startedAt: 1, durationMs: 2, error: null, ...extra };
}

test("hit lists are cut to CHAT_STEP_HITS and total keeps the full count", () => {
  const search = finishedStep(
    stage("vector-search", { lists: [{ name: "vector:q0", query: "go", hits: tracedHits(25) }] }),
  );
  const fuse = finishedStep(
    stage("fuse", {
      total: 40,
      hits: tracedHits(20).map((hit) => ({ ...hit, contributions: [{ list: "vector:q0", rank: hit.rank }] })),
    }),
  );
  const rerank = finishedStep(
    stage("rerank", {
      fallback: false,
      error: null,
      hits: tracedHits(12).map((hit) => ({ ...hit, fusedRank: hit.rank + 1 })),
    }),
  );
  const filter = finishedStep(
    stage("filter", { minRerankScore: 0.5, kept: 0, dropped: tracedHits(15) }),
  );

  if (search?.detail?.kind !== "search") throw new Error("expected a search detail");
  expect(search.detail.lists[0]?.total).toBe(25);
  expect(search.detail.lists[0]?.hits.length).toBe(CHAT_STEP_HITS);
  expect(search.detail.lists[0]?.hits[9]).toEqual({
    rank: 10,
    score: 0.91,
    title: "Job 9",
    section: "experience",
    anchor: "#experience-job-9",
  });
  if (fuse?.detail?.kind !== "fuse") throw new Error("expected a fuse detail");
  expect(fuse.detail.total).toBe(40);
  expect(fuse.detail.hits.length).toBe(CHAT_STEP_HITS);
  if (rerank?.detail?.kind !== "rerank") throw new Error("expected a rerank detail");
  expect(rerank.detail.hits.length).toBe(CHAT_STEP_HITS);
  if (filter?.detail?.kind !== "filter") throw new Error("expected a filter detail");
  expect(filter.detail.dropped.length).toBe(CHAT_STEP_HITS);
});

test("an entity key without a page anchor gives a null anchor", () => {
  const [first] = tracedHits(1);
  const step = finishedStep(
    stage("lexical-search", {
      lists: [{ name: "bm25:q0", query: "go", hits: [{ ...first, entityKeys: ["unknown"] }, { ...first, entityKeys: [] }] }],
    }),
  );

  if (step?.detail?.kind !== "search") throw new Error("expected a search detail");
  expect(step.detail.lists[0]?.hits.map((hit) => hit.anchor)).toEqual([null, null]);
});

test("an output that does not parse gives a finished step with no detail", () => {
  expect(finishedStep(stage("rewrite", { queries: "not a list", scope: "cv" }))).toEqual({
    name: "rewrite",
    status: "done",
    startedAt: 1,
    durationMs: 2,
    detail: null,
  });
  expect(finishedStep(stage("fuse", null))?.detail).toBe(null);
});

test("generate reads the source count from its input, and reasoning has an empty detail", () => {
  const generate = finishedStep(
    stage("generate", { answer: "secret answer" }, {
      input: { model: "answer-model", mode: "cv", sources: 4, historyTurns: 2 },
    }),
  );

  expect(generate?.detail).toEqual({ kind: "generate", sources: 4 });
  expect(finishedStep(stage("reasoning", null))?.detail).toEqual({ kind: "reasoning" });
});

test("the route step shows only the scope and whether the router fell back", () => {
  const routed = finishedStep(
    stage("route", {
      scope: "off_topic",
      probabilities: { cv: 0.01, smalltalk: 0.01, off_topic: 0.98 },
      choice: "off_topic",
      model: "typesafe/jev-1.13-20260917",
      fallback: false,
      error: null,
    }),
  );
  const failed = finishedStep(
    stage("route", {
      scope: null,
      probabilities: null,
      choice: null,
      model: null,
      fallback: true,
      error: "No endpoints found for secret/slug",
    }),
  );

  expect(routed?.detail).toEqual({ kind: "route", scope: "off_topic", fallback: false });
  expect(failed?.detail).toEqual({ kind: "route", scope: null, fallback: true });
  expect(JSON.stringify(failed)).not.toContain("secret");
});

test("a stage that is not a chat step gives no step", () => {
  expect(finishedStep(stage("unknown", null))).toBe(null);
  expect(isChatStepName("toString")).toBe(false);
  expect(isChatStepName("vector-search")).toBe(true);
});

test("running steps round the start to whole milliseconds", () => {
  expect(runningStep("rerank", 812.6)).toEqual({
    name: "rerank",
    status: "running",
    startedAt: 813,
    durationMs: null,
    detail: null,
  });
});
