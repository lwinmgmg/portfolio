import { expect, test } from "bun:test";

import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { EmbeddingError } from "@/server/rag/embedding/embedding-error";
import { VectorDimensionError } from "@/server/rag/search/search-errors";
import { VectorIndex } from "@/server/rag/search/vector-index";

const index = new VectorIndex([
  { id: "x", vector: [1, 0, 0] },
  { id: "xy", vector: [Math.SQRT1_2, Math.SQRT1_2, 0] },
  { id: "z", vector: [0, 0, 1] },
  { id: "minus-x", vector: [-1, 0, 0] },
]);

test("hits are ordered by cosine similarity with 1-based ranks", () => {
  const hits = index.search([1, 0, 0], 10);

  expect(hits.map((hit) => [hit.chunkId, hit.rank])).toEqual([
    ["x", 1],
    ["xy", 2],
    ["z", 3],
    ["minus-x", 4],
  ]);
  expect(hits[0].score).toBeCloseTo(1, 6);
  expect(hits[1].score).toBeCloseTo(Math.SQRT1_2, 6);
  expect(hits[2].score).toBeCloseTo(0, 6);
  expect(hits[3].score).toBeCloseTo(-1, 6);
});

test("the query is normalized, so its length does not change the scores", () => {
  const unit = index.search([0.6, 0.8, 0], 4);
  const scaled = index.search([6, 8, 0], 4);

  expect(scaled.map((hit) => hit.chunkId)).toEqual(unit.map((hit) => hit.chunkId));
  scaled.forEach((hit, position) => expect(hit.score).toBeCloseTo(unit[position].score, 6));
  // [0.6, 0.8, 0] · [1/√2, 1/√2, 0]
  expect(unit[0]).toEqual({ chunkId: "xy", rank: 1, score: unit[0].score });
  expect(unit[0].score).toBeCloseTo(1.4 * Math.SQRT1_2, 6);
});

test("stored vectors are normalized too", () => {
  const raw = new VectorIndex([
    { id: "long", vector: [10, 0] },
    { id: "short", vector: [0.1, 0.1] },
  ]);
  const hits = raw.search([1, 0], 2);

  expect(hits[0].score).toBeCloseTo(1, 6);
  expect(hits[1].score).toBeCloseTo(Math.SQRT1_2, 6);
});

test("k limits the hits", () => {
  expect(index.search([0, 0, 1], 1).map((hit) => hit.chunkId)).toEqual(["z"]);
});

test("items and queries with a different dimension are rejected", () => {
  const mixed = thrownBy(
    () =>
      new VectorIndex([
        { id: "a", vector: [1, 0] },
        { id: "b", vector: [1, 0, 0] },
      ]),
  );
  expect(mixed instanceof VectorDimensionError).toBe(true);
  expect(thrownBy(() => index.search([1, 0], 3)) instanceof VectorDimensionError).toBe(true);
});

test("a zero query vector cannot be normalized", () => {
  expect(thrownBy(() => index.search([0, 0, 0], 3)) instanceof EmbeddingError).toBe(true);
});

test("an empty index returns nothing and reports no dimension", () => {
  const empty = new VectorIndex([]);
  expect(empty.dimension).toBeNull();
  expect(empty.search([1, 2], 3)).toEqual([]);
});

test("k must be a positive integer", () => {
  expect(thrownBy(() => index.search([1, 0, 0], 0)) instanceof RangeError).toBe(true);
  expect(thrownBy(() => index.search([1, 0, 0], 1.5)) instanceof RangeError).toBe(true);
});
