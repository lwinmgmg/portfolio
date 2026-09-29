import { expect, test } from "bun:test";

import type { NamedHitList, RankedHit } from "@/server/domain/rag";
import { reciprocalRankFusion } from "@/server/rag/fusion/reciprocal-rank-fusion";

// Hits ranked 1..n in the given order. Scores are irrelevant to fusion.
function list(name: string, chunkIds: string[]): NamedHitList {
  const hits: RankedHit[] = chunkIds.map((chunkId, index) => ({
    chunkId,
    rank: index + 1,
    score: 100 - index,
  }));
  return { name, hits };
}

test("sums 1 / (k + rank) across lists, including chunks found by only one list", () => {
  const fused = reciprocalRankFusion(
    [list("vector:q0", ["a", "b", "c"]), list("bm25:q0", ["b", "d", "a"])],
    60,
  );

  expect(fused.map((hit) => hit.chunkId)).toEqual(["b", "a", "d", "c"]);
  // b: 1/62 + 1/61, a: 1/61 + 1/63, d: 1/62 only, c: 1/63 only.
  expect(fused[0].score).toBeCloseTo(0.03252247488101534, 12);
  expect(fused[1].score).toBeCloseTo(0.03226645849596669, 12);
  expect(fused[2].score).toBeCloseTo(0.016129032258064516, 12);
  expect(fused[3].score).toBeCloseTo(0.015873015873015872, 12);
  expect(fused[0].contributions).toEqual([
    { list: "vector:q0", rank: 2 },
    { list: "bm25:q0", rank: 1 },
  ]);
  expect(fused[2].contributions).toEqual([{ list: "bm25:q0", rank: 2 }]);
});

test("uses the hit's rank field, not its position in the list", () => {
  const fused = reciprocalRankFusion(
    [{ name: "vector:q0", hits: [{ chunkId: "a", rank: 4, score: 0.5 }] }],
    1,
  );

  expect(fused).toEqual([
    { chunkId: "a", score: 0.2, contributions: [{ list: "vector:q0", rank: 4 }] },
  ]);
});

test("breaks score ties by best single rank, then by chunk id", () => {
  // With k = 1: z = 1/2 (rank 1 once), a = 1/4 + 1/4 (rank 3 twice), f2 = 1/2 (rank 1 once).
  // f1 and f3 both score 1/3 at rank 2.
  const fused = reciprocalRankFusion(
    [list("vector:q0", ["z", "f1", "a"]), list("bm25:q0", ["f2", "f3", "a"])],
    1,
  );

  expect(fused.map((hit) => [hit.chunkId, hit.score])).toEqual([
    ["f2", 0.5],
    ["z", 0.5],
    ["a", 0.5],
    ["f1", 1 / 3],
    ["f3", 1 / 3],
  ]);
});

test("equal rank sets score exactly the same whatever the list order", () => {
  const fused = reciprocalRankFusion(
    [
      list("vector:q0", ["x", "y", "filler"]),
      list("vector:q1", ["filler", "filler-2", "y"]),
      list("bm25:q0", ["y", "filler-3", "x"]),
      list("bm25:q1", ["filler-4", "x"]),
    ],
    60,
  );

  const x = fused.find((hit) => hit.chunkId === "x");
  const y = fused.find((hit) => hit.chunkId === "y");
  // Both ranked 1, 2 and 3, just in different lists.
  expect(x?.score).toBe(y?.score ?? Number.NaN);
  expect(fused.findIndex((hit) => hit.chunkId === "x")).toBeLessThan(
    fused.findIndex((hit) => hit.chunkId === "y"),
  );
});

test("a single list keeps its order", () => {
  const fused = reciprocalRankFusion([list("bm25:q0", ["c", "a", "b"])], 60);

  expect(fused.map((hit) => hit.chunkId)).toEqual(["c", "a", "b"]);
});

test("a chunk repeated inside one list counts once, at its best rank", () => {
  const fused = reciprocalRankFusion(
    [
      {
        name: "vector:q0",
        hits: [
          { chunkId: "a", rank: 1, score: 0.9 },
          { chunkId: "a", rank: 2, score: 0.8 },
        ],
      },
    ],
    1,
  );

  expect(fused).toEqual([
    { chunkId: "a", score: 0.5, contributions: [{ list: "vector:q0", rank: 1 }] },
  ]);
});

test("no lists or empty lists fuse to nothing", () => {
  expect(reciprocalRankFusion([], 60)).toEqual([]);
  expect(reciprocalRankFusion([list("vector:q0", []), list("bm25:q0", [])], 60)).toEqual([]);
});

test("rejects a k or rank that is not a positive integer", () => {
  expect(() => reciprocalRankFusion([], 0)).toThrow();
  expect(() => reciprocalRankFusion([], 1.5)).toThrow();
  expect(() =>
    reciprocalRankFusion([{ name: "v", hits: [{ chunkId: "a", rank: 0, score: 1 }] }], 60),
  ).toThrow();
});
