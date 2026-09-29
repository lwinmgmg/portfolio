import { expect, test } from "bun:test";

import type { TextAnalyzer } from "@/server/domain/rag";
import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { Bm25Index } from "@/server/rag/search/bm25-index";
import { EnglishTextAnalyzer } from "@/server/rag/search/english-text-analyzer";

// Splits on spaces only, so the expected scores depend on the BM25 formula alone.
const words: TextAnalyzer = { analyze: (text) => text.split(" ").filter(Boolean) };

// N = 3, avgdl = 3. df: apple 1, banana 2, cherry 2, date 1, elder 1, fig 1.
// idf(df = 1) = ln(1 + 2.5 / 1.5) = 0.9808292530; idf(df = 2) = ln(1 + 1.5 / 2.5) = 0.4700036292.
const corpus = [
  { id: "d1", text: "apple banana apple" }, // dl 3
  { id: "d2", text: "banana cherry" }, // dl 2
  { id: "d3", text: "cherry date elder fig" }, // dl 4
];

const index = new Bm25Index(corpus, words);

test("scores match the hand-computed BM25 values", () => {
  // d1: apple 0.98083 · (2 · 2.2) / (2 + 1.2 · 1) + banana 0.47000 · 2.2 / (1 + 1.2 · 1)
  // d2: banana 0.47000 · 2.2 / (1 + 1.2 · (0.25 + 0.75 · 2/3))
  const hits = index.search("apple banana", 10);

  expect(hits.map((hit) => [hit.chunkId, hit.rank])).toEqual([
    ["d1", 1],
    ["d2", 2],
  ]);
  expect(hits[0].score).toBeCloseTo(1.8186438521, 6);
  expect(hits[1].score).toBeCloseTo(0.5442147286, 6);
});

test("a shorter document wins at equal term frequency", () => {
  // d3: cherry 0.47000 · 2.2 / (1 + 1.2 · (0.25 + 0.75 · 4/3))
  const hits = index.search("cherry", 10);

  expect(hits.map((hit) => hit.chunkId)).toEqual(["d2", "d3"]);
  expect(hits[0].score).toBeCloseTo(0.5442147286, 6);
  expect(hits[1].score).toBeCloseTo(0.4136031937, 6);
});

test("repeated query terms count once and a rarer term ranks higher", () => {
  const hits = index.search("banana banana fig", 10);

  expect(hits.map((hit) => hit.chunkId)).toEqual(["d3", "d2", "d1"]);
  expect(hits[0].score).toBeCloseTo(0.8631297427, 6);
  expect(hits[1].score).toBeCloseTo(0.5442147286, 6);
  expect(hits[2].score).toBeCloseTo(0.4700036292, 6);
});

test("k limits the hits and ranks are 1-based", () => {
  expect(index.search("banana banana fig", 1)).toEqual([
    { chunkId: "d3", rank: 1, score: index.search("fig", 1)[0].score },
  ]);
});

test("an empty query, a query of unknown terms and an empty corpus return nothing", () => {
  expect(index.search("", 5)).toEqual([]);
  expect(index.search("grape", 5)).toEqual([]);
  expect(new Bm25Index([], words).search("apple", 5)).toEqual([]);
});

test("equal scores keep document order", () => {
  const twins = new Bm25Index(
    [
      { id: "b", text: "kafka" },
      { id: "a", text: "kafka" },
    ],
    words,
  );
  expect(twins.search("kafka", 5).map((hit) => hit.chunkId)).toEqual(["b", "a"]);
});

test("documents and queries go through the analyzer", () => {
  const cv = new Bm25Index(
    [
      { id: "web", text: "Built web services with Node.js and TypeScript." },
      { id: "ml", text: "Trained models in Python." },
    ],
    new EnglishTextAnalyzer(),
  );

  expect(cv.search("the Node service", 5).map((hit) => hit.chunkId)).toEqual(["web"]);
  expect(cv.search("python", 5).map((hit) => hit.chunkId)).toEqual(["ml"]);
  expect(cv.search("the and with", 5)).toEqual([]);
});

test("ignored terms are dropped from the query before scoring", () => {
  // Only banana is scored. d1: 0.47000 · 2.2 / (1 + 1.2 · 1); d2 as above.
  const hits = index.search("apple banana", 10, { ignoreTermsOf: "apple" });

  expect(hits.map((hit) => hit.chunkId)).toEqual(["d2", "d1"]);
  expect(hits[0].score).toBeCloseTo(0.5442147286, 6);
  expect(hits[1].score).toBeCloseTo(0.4700036292, 6);
});

test("a query of only ignored terms returns nothing", () => {
  expect(index.search("apple apple", 5, { ignoreTermsOf: "apple fig" })).toEqual([]);
  expect(index.search("apple", 5, { ignoreTermsOf: "" })).toEqual(index.search("apple", 5));
});

test("ignored text goes through the analyzer, so case and possessives match", () => {
  const cv = new Bm25Index(
    [
      { id: "profile", text: "Lwin Maung Maung. Software engineer. Contact Lwin Maung Maung." },
      { id: "project", text: "Built a contextual RAG chat for a portfolio." },
    ],
    new EnglishTextAnalyzer(),
  );
  const query = "What has LWIN Maung Maung's team built recently?";

  expect(cv.search(query, 5)[0].chunkId).toBe("profile");
  expect(
    cv.search(query, 5, { ignoreTermsOf: "Lwin Maung Maung" }).map((hit) => hit.chunkId),
  ).toEqual(["project"]);
});

test("invalid k or parameters are rejected", () => {
  expect(thrownBy(() => index.search("apple", 0)) instanceof RangeError).toBe(true);
  expect(thrownBy(() => new Bm25Index(corpus, words, { k1: -1 })) instanceof RangeError).toBe(true);
  expect(thrownBy(() => new Bm25Index(corpus, words, { b: 1.5 })) instanceof RangeError).toBe(true);
});
