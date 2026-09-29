import { expect, test } from "bun:test";

import { RagIndexNotFoundError, type RetrievalRequest, type RetrievalRunner } from "@/server/domain/rag";
import { FakeRetrievalRunner, readyIndex } from "@/server/rag/__fixtures__/fake-retrieval-runner";
import { parseGoldenSet } from "@/server/rag/eval/golden-set";
import { RetrievalEvaluator, type EvalProgress } from "@/server/rag/eval/retrieval-evaluator";
import { RETRIEVAL_PRESETS } from "@/server/rag/pipeline/retrieval-config";

const now = () => new Date("2026-09-29T08:00:00.000Z");

const ITEMS = parseGoldenSet([
  {
    id: "work",
    question: "Where does she work?",
    relevantEntityKeys: ["experience:acme"],
    tags: ["experience"],
  },
  {
    id: "cert-date",
    question: "When did she get it?",
    history: [{ role: "user", text: "Any certifications?" }],
    relevantEntityKeys: ["certification:aws", "profile"],
  },
]);

const ANSWERS = {
  "Where does she work?": [["profile"], ["experience:acme"], ["skills:languages"]],
  "When did she get it?": [["certification:aws"]],
};

const KEYS = new Set(["profile", "experience:acme", "skills:languages", "certification:aws"]);

function input(overrides: Partial<Parameters<RetrievalEvaluator["evaluate"]>[0]> = {}) {
  return {
    items: ITEMS,
    targets: [{ index: readyIndex("index-1"), entityKeys: KEYS }],
    presets: ["hybrid", "hybrid-rerank"] as const,
    ks: [5, 1, 3],
    subjectName: "Jane Doe",
    tags: [],
    ...overrides,
  };
}

test("runs every question for each index and preset, in order, as eval traces", async () => {
  const runner = new FakeRetrievalRunner(ANSWERS);
  const progress: EvalProgress[] = [];
  const evaluator = new RetrievalEvaluator({ runner, now, onProgress: (entry) => progress.push(entry) });
  const report = await evaluator.evaluate(
    input({
      targets: [
        { index: readyIndex("index-1"), entityKeys: KEYS },
        { index: readyIndex("index-2", { chunker: "token-window" }), entityKeys: KEYS },
      ],
    }),
  );

  const order = (request: RetrievalRequest) =>
    `${request.indexId}:${request.config.rerank ? "rerank" : "plain"}:${request.message}`;
  expect(runner.requests.map(order)).toEqual([
    "index-1:plain:Where does she work?",
    "index-1:plain:When did she get it?",
    "index-1:rerank:Where does she work?",
    "index-1:rerank:When did she get it?",
    "index-2:plain:Where does she work?",
    "index-2:plain:When did she get it?",
    "index-2:rerank:Where does she work?",
    "index-2:rerank:When did she get it?",
  ]);
  expect(runner.requests[1]).toMatchObject({
    kind: "eval",
    subjectName: "Jane Doe",
    history: [{ role: "user", text: "Any certifications?" }],
    config: RETRIEVAL_PRESETS.hybrid,
  });
  expect(report.runs.map((run) => `${run.indexId}:${run.preset}`)).toEqual([
    "index-1:hybrid",
    "index-1:hybrid-rerank",
    "index-2:hybrid",
    "index-2:hybrid-rerank",
  ]);
  expect(progress.map((entry) => `${entry.done}/${entry.total}`)).toEqual(
    ["1", "2", "3", "4", "5", "6", "7", "8"].map((done) => `${done}/8`),
  );
  expect(report).toMatchObject({
    createdAt: "2026-09-29T08:00:00.000Z",
    subjectName: "Jane Doe",
    ks: [1, 3, 5],
    items: 2,
  });
});

test("scores each question and averages metrics and stage timings per run", async () => {
  const report = await new RetrievalEvaluator({ runner: new FakeRetrievalRunner(ANSWERS), now }).evaluate(
    input(),
  );
  const [plain, reranked] = report.runs;

  expect(plain?.results[0]).toMatchObject({
    itemId: "work",
    tags: ["experience"],
    scope: "cv",
    metrics: { hitAt: { 1: 0, 3: 1, 5: 1 }, recallAt: { 1: 0, 3: 1, 5: 1 }, reciprocalRank: 0.5 },
    totalMs: 4,
    stageMs: { rewrite: 1, "lexical-search": 2 },
    error: null,
  });
  expect(plain?.results[0]?.retrieved.map((chunk) => chunk.relevant)).toEqual([false, true, false]);
  expect(plain?.results[1]?.metrics).toEqual({
    hitAt: { 1: 1, 3: 1, 5: 1 },
    recallAt: { 1: 0.5, 3: 0.5, 5: 0.5 },
    reciprocalRank: 1,
  });

  expect(plain?.summary).toEqual({
    questions: 2,
    errors: 0,
    metrics: {
      hitAt: { 1: 0.5, 3: 1, 5: 1 },
      recallAt: { 1: 0.25, 3: 0.75, 5: 0.75 },
      reciprocalRank: 0.75,
    },
    meanTotalMs: 4,
    meanStageMs: { rewrite: 1, "lexical-search": 2 },
  });
  expect(reranked?.summary.meanStageMs).toEqual({ rewrite: 1, "lexical-search": 2, rerank: 5 });
  expect(reranked?.summary.meanTotalMs).toBe(10);
});

test("a failed retrieval scores 0 and keeps the stage error and partial timings", async () => {
  const runner = new FakeRetrievalRunner(ANSWERS, { "When did she get it?": "rate limited" });
  const report = await new RetrievalEvaluator({ runner, now }).evaluate(input({ presets: ["hybrid"] }));
  const run = report.runs[0];

  expect(run?.results[1]).toMatchObject({
    itemId: "cert-date",
    scope: null,
    queries: [],
    retrieved: [],
    metrics: { hitAt: { 1: 0, 3: 0, 5: 0 }, reciprocalRank: 0 },
    totalMs: 3,
    stageMs: { rewrite: 1, "lexical-search": 2 },
    error: { stage: "lexical-search", message: "rate limited" },
  });
  expect(run?.summary.errors).toBe(1);
  expect(run?.summary.metrics.hitAt[5]).toBe(0.5);
});

test("errors outside a stage stop the evaluation", async () => {
  const runner: RetrievalRunner = {
    run: () => Promise.reject(new RagIndexNotFoundError("gone")),
  };
  await expect(new RetrievalEvaluator({ runner }).evaluate(input())).rejects.toBeInstanceOf(
    RagIndexNotFoundError,
  );
});

test("reports golden keys each index does not contain", async () => {
  const report = await new RetrievalEvaluator({ runner: new FakeRetrievalRunner(ANSWERS) }).evaluate(
    input({ targets: [{ index: readyIndex("index-1"), entityKeys: new Set(["profile"]) }] }),
  );
  expect(report.indexes).toEqual([
    {
      id: "index-1",
      sourceId: "cv-1",
      config: readyIndex("index-1").config,
      createdAt: "2026-09-28T08:00:00.000Z",
      unknownKeys: [
        { itemId: "work", keys: ["experience:acme"] },
        { itemId: "cert-date", keys: ["certification:aws"] },
      ],
    },
  ]);
});

test("the chat preset runs the saved chat config and is reported as chat", async () => {
  const runner = new FakeRetrievalRunner(ANSWERS);
  const chatConfig = { ...RETRIEVAL_PRESETS["hybrid-rerank"], minRerankScore: 0.2 };

  const report = await new RetrievalEvaluator({ runner, now }).evaluate(
    input({ presets: ["hybrid-rerank", "chat"], chatConfig }),
  );

  expect(report.runs.map((run) => [run.preset, run.config])).toEqual([
    ["hybrid-rerank", RETRIEVAL_PRESETS["hybrid-rerank"]],
    ["chat", chatConfig],
  ]);
  expect(runner.requests.at(-1)?.config).toEqual(chatConfig);
});

test("the chat preset without a chat config fails before any question runs", async () => {
  const runner = new FakeRetrievalRunner(ANSWERS);

  await expect(
    new RetrievalEvaluator({ runner }).evaluate(input({ presets: ["hybrid", "chat"] })),
  ).rejects.toBeInstanceOf(RangeError);
  expect(runner.requests).toEqual([]);
});

test("needs questions and valid cutoffs", async () => {
  const evaluator = new RetrievalEvaluator({ runner: new FakeRetrievalRunner(ANSWERS) });
  await expect(evaluator.evaluate(input({ items: [] }))).rejects.toBeInstanceOf(RangeError);
  await expect(evaluator.evaluate(input({ ks: [0] }))).rejects.toBeInstanceOf(RangeError);
});
