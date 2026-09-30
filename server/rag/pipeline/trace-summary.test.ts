import { expect, test } from "bun:test";

import type { RetrievalTrace, TraceSource, TraceStage } from "@/server/domain/rag";
import { goldenSnippetFor } from "@/server/rag/eval/golden-snippet";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import { readTrace } from "@/server/rag/pipeline/trace-reader";
import { summarizeTrace } from "@/server/rag/pipeline/trace-summary";

function stage(name: string, input: unknown, output: unknown, error: string | null = null): TraceStage {
  return { name, input, output, startedAt: 0, durationMs: 1, error };
}

const source = (sourceId: string, title: string, entityKeys: string[]): TraceSource => ({
  sourceId,
  chunkId: `c-${sourceId}`,
  title,
  section: "experience",
  entityKeys,
  context: null,
  text: "text",
  fusedScore: 0.1,
  rerankScore: 0.9,
});

const rewrite = stage(
  "rewrite",
  {
    message: "Where does she work?",
    history: [{ role: "user", text: "Hi" }],
    mode: "standalone",
    subjectName: "Jane",
  },
  { queries: ["Where does Jane work?"], scope: "cv", raw: null },
);

const generate = stage(
  "generate",
  { model: "m", mode: "cv", sources: 2, historyTurns: 1 },
  {
    model: "m",
    usage: { promptTokens: 100, completionTokens: 42, cost: null },
    answer: "At Acme [S1].",
    stopped: false,
    citedSourceIds: ["S1"],
  },
);

function view(stages: TraceStage[], sources: TraceSource[] = []) {
  const trace: RetrievalTrace = {
    id: "0123456789abcdef",
    kind: "chat",
    indexId: "i1",
    config: { ...DEFAULT_RETRIEVAL_CONFIG },
    stages,
    sources,
    totalMs: 250,
    createdAt: "2026-09-30T08:00:00.000Z",
  };
  return readTrace(trace);
}

test("a chat trace is summarized from its stages", () => {
  const summary = summarizeTrace(
    view([rewrite, generate], [source("S1", "Acme", ["experience:acme"]), source("S2", "Skills", ["skills:x"])]),
    "down",
  );

  expect(summary).toMatchObject({
    question: "Where does she work?",
    rewritten: "Where does Jane work?",
    scope: "cv",
    sourceTitles: ["Acme", "Skills"],
    totalMs: 250,
    answerTokens: 42,
    feedback: "down",
    failedStage: null,
  });
});

test("an unchanged query is not repeated, and a missing generate stage has no tokens", () => {
  const same = stage("rewrite", { message: "Hi", history: [], mode: "none", subjectName: "Jane" }, {
    queries: ["Hi"],
    scope: "smalltalk",
    raw: null,
  });
  const summary = summarizeTrace(view([same]));

  expect(summary.rewritten).toBeNull();
  expect(summary.answerTokens).toBeNull();
  expect(summary.scope).toBe("smalltalk");
  expect(summary.feedback).toBeNull();
});

test("the first failed stage is named, and a trace without a rewrite has no question", () => {
  const summary = summarizeTrace(view([stage("embed-queries", {}, null, "boom")]));

  expect(summary.failedStage).toBe("embed-queries");
  expect(summary.question).toBeNull();
});

test("a golden snippet carries the question, history and the distinct entity keys", () => {
  const snippet = goldenSnippetFor(
    view([rewrite, generate], [source("S1", "A", ["experience:acme", "skills:x"]), source("S2", "B", ["skills:x"])]),
  );

  expect(snippet).toEqual({
    id: "trace-01234567",
    question: "Where does she work?",
    history: [{ role: "user", text: "Hi" }],
    relevantEntityKeys: ["experience:acme", "skills:x"],
    tags: ["from-trace"],
  });
});

test("a golden snippet keeps a non-cv scope and needs a recorded question", () => {
  const offTopic = stage("rewrite", { message: "Weather?", history: [], mode: "none", subjectName: "J" }, {
    queries: ["Weather?"],
    scope: "off_topic",
    raw: null,
  });

  expect(goldenSnippetFor(view([offTopic]))?.expectedScope).toBe("off_topic");
  expect(goldenSnippetFor(view([]))).toBeNull();
});
