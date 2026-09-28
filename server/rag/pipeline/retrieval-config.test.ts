import { expect, test } from "bun:test";

import {
  DEFAULT_RETRIEVAL_CONFIG,
  RETRIEVAL_PRESET_NAMES,
  RETRIEVAL_PRESETS,
  RetrievalConfigSchema,
  isRetrievalPresetName,
} from "@/server/rag/pipeline/retrieval-config";

test("an empty config parses to the documented defaults", () => {
  const expected = {
    rewrite: "standalone",
    search: "hybrid",
    candidatesPerSearch: 20,
    rrfK: 60,
    fusedLimit: 20,
    rerank: true,
    finalK: 5,
    minRerankScore: 0,
  };
  expect(RetrievalConfigSchema.parse({})).toEqual(expected);
  expect(DEFAULT_RETRIEVAL_CONFIG).toEqual(expected);
  expect(Object.isFrozen(DEFAULT_RETRIEVAL_CONFIG)).toBe(true);
});

test("given fields override the defaults and the rest are filled", () => {
  expect(RetrievalConfigSchema.parse({ search: "lexical", finalK: 3 })).toEqual({
    ...DEFAULT_RETRIEVAL_CONFIG,
    search: "lexical",
    finalK: 3,
  });
});

for (const [field, min, max] of [
  ["candidatesPerSearch", 1, 50],
  ["rrfK", 1, 200],
  ["fusedLimit", 1, 50],
  ["finalK", 1, 10],
] as const) {
  test(`${field} accepts ${min}..${max} integers only`, () => {
    expect(RetrievalConfigSchema.safeParse({ [field]: min }).success).toBe(true);
    expect(RetrievalConfigSchema.safeParse({ [field]: max }).success).toBe(true);
    expect(RetrievalConfigSchema.safeParse({ [field]: min - 1 }).success).toBe(false);
    expect(RetrievalConfigSchema.safeParse({ [field]: max + 1 }).success).toBe(false);
    expect(RetrievalConfigSchema.safeParse({ [field]: min + 0.5 }).success).toBe(false);
  });
}

test("minRerankScore accepts 0..1", () => {
  expect(RetrievalConfigSchema.safeParse({ minRerankScore: 0 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ minRerankScore: 0.35 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ minRerankScore: 1 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ minRerankScore: -0.01 }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ minRerankScore: 1.01 }).success).toBe(false);
});

test("unknown modes and unknown keys are rejected", () => {
  expect(RetrievalConfigSchema.safeParse({ rewrite: "hyde" }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ search: "fuzzy" }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ topK: 5 }).success).toBe(false);
});

test("presets set rewriting, search and reranking on top of the defaults", () => {
  const shapes = RETRIEVAL_PRESET_NAMES.map((name) => {
    const { rewrite, search, rerank, ...rest } = RETRIEVAL_PRESETS[name];
    expect(rest).toEqual({
      candidatesPerSearch: 20,
      rrfK: 60,
      fusedLimit: 20,
      finalK: 5,
      minRerankScore: 0,
    });
    return [name, rewrite, search, rerank];
  });
  expect(shapes).toEqual([
    ["vector-only", "none", "vector", false],
    ["lexical-only", "none", "lexical", false],
    ["hybrid", "none", "hybrid", false],
    ["hybrid-rerank", "none", "hybrid", true],
    ["hybrid-rerank-rewrite", "standalone", "hybrid", true],
    ["full", "multi", "hybrid", true],
  ]);
});

test("every preset is a valid config and the default equals hybrid-rerank-rewrite", () => {
  for (const name of RETRIEVAL_PRESET_NAMES) {
    expect(RetrievalConfigSchema.parse(RETRIEVAL_PRESETS[name])).toEqual(RETRIEVAL_PRESETS[name]);
  }
  expect(RETRIEVAL_PRESETS["hybrid-rerank-rewrite"]).toEqual(DEFAULT_RETRIEVAL_CONFIG);
});

test("isRetrievalPresetName recognizes only preset names", () => {
  expect(isRetrievalPresetName("full")).toBe(true);
  expect(isRetrievalPresetName("hybrid-rerank")).toBe(true);
  expect(isRetrievalPresetName("Full")).toBe(false);
  expect(isRetrievalPresetName("toString")).toBe(false);
});
