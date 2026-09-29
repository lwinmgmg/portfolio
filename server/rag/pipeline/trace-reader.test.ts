import { expect, test } from "bun:test";

import type { RetrievalTrace, TraceStage } from "@/server/domain/rag";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import { readTrace } from "@/server/rag/pipeline/trace-reader";

function stage(name: string, input: unknown, output: unknown, error: string | null = null): TraceStage {
  return { name, input, output, startedAt: 1, durationMs: 2, error };
}

function traceWith(stages: TraceStage[]): RetrievalTrace {
  return {
    id: "trace-1",
    kind: "playground",
    indexId: "index-1",
    config: { ...DEFAULT_RETRIEVAL_CONFIG },
    stages,
    sources: [],
    totalMs: 10,
    createdAt: "2026-09-29T08:00:00.000Z",
  };
}

const hit = {
  chunkId: "c1",
  rank: 1,
  score: 0.5,
  title: "Acme",
  section: "experience",
  entityKeys: ["experience:acme"],
};

test("known stages are parsed into typed details with their timing", () => {
  const view = readTrace(
    traceWith([
      stage(
        "rewrite",
        { message: "Where?", history: [], mode: "standalone", subjectName: "Jane" },
        { queries: ["Where did Jane work?"], scope: "cv", raw: { standalone: "Where did Jane work?" } },
      ),
      stage("embed-queries", { model: "m" }, { model: "m", count: 1, dimensions: 3 }),
      stage("vector-search", {}, { lists: [{ name: "vector:q0", query: "q", hits: [hit] }] }),
      stage("lexical-search", {}, { lists: [] }),
      stage("fuse", {}, { total: 1, hits: [{ ...hit, contributions: [{ list: "vector:q0", rank: 1 }] }] }),
      stage("rerank", {}, { fallback: false, error: null, hits: [{ ...hit, fusedRank: 1 }] }),
      stage("filter", {}, { minRerankScore: 0.2, kept: 1, dropped: [] }),
    ]),
  );

  expect(view.stages.map((entry) => [entry.name, entry.detail.kind])).toEqual([
    ["rewrite", "rewrite"],
    ["embed-queries", "embed"],
    ["vector-search", "search"],
    ["lexical-search", "search"],
    ["fuse", "fuse"],
    ["rerank", "rerank"],
    ["filter", "filter"],
  ]);
  expect(view.stages[0]).toMatchObject({ startedAt: 1, durationMs: 2, error: null });
  expect(view.id).toBe("trace-1");
});

test("a failed, unknown or reshaped stage falls back to raw JSON", () => {
  const view = readTrace(
    traceWith([
      stage("rewrite", { message: "Where?" }, null, "provider down"),
      stage("generate", { model: "answer" }, { tokens: 12 }),
      stage("fuse", {}, { hits: "not a list" }),
    ]),
  );

  expect(view.stages.map((entry) => entry.detail.kind)).toEqual(["raw", "raw", "raw"]);
  expect(view.stages[0]?.error).toBe("provider down");
  expect(view.stages[1]?.detail).toEqual({
    kind: "raw",
    input: '{\n  "model": "answer"\n}',
    output: '{\n  "tokens": 12\n}',
  });
});

test("an undefined value still renders as text", () => {
  const view = readTrace(traceWith([stage("custom", undefined, undefined)]));
  expect(view.stages[0]?.detail).toEqual({ kind: "raw", input: "undefined", output: "undefined" });
});
