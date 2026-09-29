import { expect, test } from "bun:test";

import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import {
  firstRelevantRank,
  hitAtK,
  meanMetrics,
  questionMetrics,
  recallAtK,
  reciprocalRank,
  type Ranking,
} from "@/server/rag/eval/metrics";

// Entity keys of each retrieved chunk, best first.
const RANKING: Ranking = [
  ["profile"],
  ["experience:acme"],
  ["skills:languages", "skills:tools"],
  ["project:portfolio"],
  ["experience:globex"],
];

test("a chunk is relevant when any of its keys is relevant", () => {
  expect(firstRelevantRank(RANKING, ["skills:tools"])).toBe(3);
  expect(firstRelevantRank(RANKING, ["project:portfolio", "experience:acme"])).toBe(2);
  expect(firstRelevantRank(RANKING, ["education:tu-berlin"])).toBeNull();
});

test("hit@k is 1 only when a relevant chunk is within the top k", () => {
  expect(hitAtK(RANKING, ["experience:acme"], 1)).toBe(0);
  expect(hitAtK(RANKING, ["experience:acme"], 2)).toBe(1);
  expect(hitAtK(RANKING, ["experience:acme"], 5)).toBe(1);
  expect(hitAtK(RANKING, ["education:tu-berlin"], 5)).toBe(0);
  expect(hitAtK([], ["profile"], 5)).toBe(0);
});

test("recall@k counts distinct relevant keys covered by the top k", () => {
  const relevant = ["experience:acme", "experience:globex", "skills:tools", "experience:acme"];
  expect(recallAtK(RANKING, relevant, 1)).toBe(0);
  expect(recallAtK(RANKING, relevant, 2)).toBeCloseTo(1 / 3);
  expect(recallAtK(RANKING, relevant, 3)).toBeCloseTo(2 / 3);
  expect(recallAtK(RANKING, relevant, 5)).toBe(1);
  expect(recallAtK(RANKING, relevant, 50)).toBe(1);
});

test("a key repeated across chunks counts once for recall", () => {
  const ranking: Ranking = [["experience:acme"], ["experience:acme"], ["profile"]];
  expect(recallAtK(ranking, ["experience:acme", "project:portfolio"], 3)).toBe(0.5);
});

test("reciprocal rank uses the first relevant chunk and stops after rank 10", () => {
  expect(reciprocalRank(RANKING, ["profile"])).toBe(1);
  expect(reciprocalRank(RANKING, ["project:portfolio", "experience:globex"])).toBe(0.25);
  expect(reciprocalRank(RANKING, ["education:tu-berlin"])).toBe(0);

  const deep: Ranking = [...Array.from({ length: 10 }, () => ["other:x"]), ["profile"]];
  expect(reciprocalRank(deep, ["profile"])).toBe(0);
  expect(reciprocalRank(deep.slice(1), ["profile"])).toBe(0.1);
});

test("questionMetrics reports every cutoff", () => {
  expect(questionMetrics(RANKING, ["skills:languages"], [1, 3, 5])).toEqual({
    hitAt: { 1: 0, 3: 1, 5: 1 },
    recallAt: { 1: 0, 3: 1, 5: 1 },
    reciprocalRank: 1 / 3,
  });
  expect(questionMetrics([], ["profile"], [1])).toEqual({
    hitAt: { 1: 0 },
    recallAt: { 1: 0 },
    reciprocalRank: 0,
  });
});

test("meanMetrics averages each metric over the questions", () => {
  const ks = [1, 3];
  const all = [
    questionMetrics(RANKING, ["profile"], ks),
    questionMetrics(RANKING, ["skills:tools", "experience:globex"], ks),
    questionMetrics(RANKING, ["education:tu-berlin"], ks),
  ];
  const means = meanMetrics(all, ks);
  expect(means.hitAt[1]).toBeCloseTo(1 / 3);
  expect(means.hitAt[3]).toBeCloseTo(2 / 3);
  expect(means.recallAt[3]).toBeCloseTo((1 + 0.5 + 0) / 3);
  expect(means.reciprocalRank).toBeCloseTo((1 + 1 / 3 + 0) / 3);
});

test("cutoffs must be positive integers and means need questions", () => {
  expect(thrownBy(() => questionMetrics(RANKING, ["profile"], [])) instanceof RangeError).toBe(true);
  expect(thrownBy(() => questionMetrics(RANKING, ["profile"], [0])) instanceof RangeError).toBe(true);
  expect(thrownBy(() => questionMetrics(RANKING, ["profile"], [1.5])) instanceof RangeError).toBe(true);
  expect(thrownBy(() => meanMetrics([], [1])) instanceof RangeError).toBe(true);
  const missing = [questionMetrics(RANKING, ["profile"], [1])];
  expect(thrownBy(() => meanMetrics(missing, [1, 3])) instanceof RangeError).toBe(true);
});
