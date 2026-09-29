import { expect, test } from "bun:test";

import type { TraceSource } from "@/server/domain/rag";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import { TraceRecorder } from "@/server/rag/pipeline/trace-recorder";

// A clock that reads 100, then advances by `step` on each later read.
function steppingClock(step = 10) {
  let time = 100 - step;
  return () => (time += step);
}

function recorder(clock = steppingClock()) {
  return new TraceRecorder({
    kind: "playground",
    indexId: "index-1",
    config: DEFAULT_RETRIEVAL_CONFIG,
    id: "trace-1",
    now: () => new Date("2026-09-29T08:00:00.000Z"),
    clock,
  });
}

test("a stage records its input, output and timing relative to the trace start", async () => {
  const trace = recorder();

  const result = await trace.stage("rewrite", { message: "hi" }, async () => ({ queries: ["hi"] }));

  expect(result).toEqual({ queries: ["hi"] });
  expect(trace.toTrace()).toEqual({
    id: "trace-1",
    kind: "playground",
    indexId: "index-1",
    config: { ...DEFAULT_RETRIEVAL_CONFIG },
    stages: [
      {
        name: "rewrite",
        input: { message: "hi" },
        output: { queries: ["hi"] },
        startedAt: 10,
        durationMs: 10,
        error: null,
      },
    ],
    sources: [],
    totalMs: 30,
    createdAt: "2026-09-29T08:00:00.000Z",
  });
});

test("summarize shapes the recorded output but the caller gets the full result", async () => {
  const trace = recorder();

  const vectors = await trace.stage(
    "embed-queries",
    { model: "m" },
    async () => [[1, 2, 3]],
    (output) => ({ count: output.length }),
  );

  expect(vectors).toEqual([[1, 2, 3]]);
  expect(trace.toTrace().stages[0]?.output).toEqual({ count: 1 });
});

test("a failed stage keeps its error message and the error is rethrown", async () => {
  const trace = recorder();
  const failure = new Error("provider down");

  const thrown = await trace
    .stage("rerank", { topN: 5 }, async () => {
      throw failure;
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(thrown).toBe(failure);
  expect(trace.toTrace().stages).toEqual([
    {
      name: "rerank",
      input: { topN: 5 },
      output: null,
      startedAt: 10,
      durationMs: 10,
      error: "provider down",
    },
  ]);
});

test("stages are listed in start order even when a later one finishes first", async () => {
  const trace = recorder();
  let release: () => void = () => undefined;
  const slow = trace.stage("slow", null, () => new Promise<string>((resolve) => {
    release = () => resolve("slow");
  }));
  await trace.stage("fast", null, async () => "fast");
  release();
  await slow;

  expect(trace.toTrace().stages.map((stage) => stage.name)).toEqual(["slow", "fast"]);
});

test("toTrace copies the sources and later stages do not change an earlier trace", async () => {
  const trace = recorder();
  const source: TraceSource = {
    sourceId: "S1",
    chunkId: "c1",
    title: "Acme",
    section: "experience",
    entityKeys: ["experience:acme"],
    context: null,
    text: "Staff engineer.",
    fusedScore: 0.03,
    rerankScore: null,
  };

  const first = trace.toTrace([source]);
  source.entityKeys.push("changed");
  await trace.stage("later", null, async () => 1);

  expect(first.sources[0]?.entityKeys).toEqual(["experience:acme"]);
  expect(first.stages.length).toBe(0);
});

test("the trace id defaults to a random UUID", () => {
  const trace = new TraceRecorder({ kind: "eval", indexId: null, config: DEFAULT_RETRIEVAL_CONFIG });
  expect(/^[0-9a-f-]{36}$/.test(trace.id)).toBe(true);
});
