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
    ignoreSubjectInLexical: true,
    ignoreSubjectInRerank: true,
    dropBelowMeanRerank: true,
    meanCutoffFactor: 0.5,
    scopeRouter: "rewriter",
    minRouteConfidence: 0.8,
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

test("meanCutoffFactor accepts 0..1 and defaults to 0.5 for a stored config without it", () => {
  expect(RetrievalConfigSchema.parse({}).meanCutoffFactor).toBe(0.5);
  expect(RetrievalConfigSchema.safeParse({ meanCutoffFactor: 0 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ meanCutoffFactor: 1 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ meanCutoffFactor: -0.01 }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ meanCutoffFactor: 1.01 }).success).toBe(false);
});

test("ignoreSubjectInLexical is on unless a stored config turns it off", () => {
  // A config saved before the field existed.
  const saved: Record<string, unknown> = { ...DEFAULT_RETRIEVAL_CONFIG };
  delete saved.ignoreSubjectInLexical;
  expect(RetrievalConfigSchema.parse(saved).ignoreSubjectInLexical).toBe(true);
  expect(RetrievalConfigSchema.parse({ ignoreSubjectInLexical: false }).ignoreSubjectInLexical).toBe(
    false,
  );
  expect(RetrievalConfigSchema.safeParse({ ignoreSubjectInLexical: "on" }).success).toBe(false);
});

test("ignoreSubjectInRerank is on unless a stored config turns it off", () => {
  // A config saved before the field existed.
  const saved: Record<string, unknown> = { ...DEFAULT_RETRIEVAL_CONFIG };
  delete saved.ignoreSubjectInRerank;
  expect(RetrievalConfigSchema.parse(saved).ignoreSubjectInRerank).toBe(true);
  expect(RetrievalConfigSchema.parse({ ignoreSubjectInRerank: false }).ignoreSubjectInRerank).toBe(
    false,
  );
  expect(RetrievalConfigSchema.safeParse({ ignoreSubjectInRerank: "on" }).success).toBe(false);
});

test("dropBelowMeanRerank is on unless a stored config turns it off", () => {
  // A config saved before the field existed.
  const saved: Record<string, unknown> = { ...DEFAULT_RETRIEVAL_CONFIG };
  delete saved.dropBelowMeanRerank;
  expect(RetrievalConfigSchema.parse(saved).dropBelowMeanRerank).toBe(true);
  expect(RetrievalConfigSchema.parse({ dropBelowMeanRerank: false }).dropBelowMeanRerank).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ dropBelowMeanRerank: "on" }).success).toBe(false);
});

test("a config saved before scope routing parses with the rewriter as router", () => {
  const saved: Record<string, unknown> = { ...DEFAULT_RETRIEVAL_CONFIG };
  delete saved.scopeRouter;
  delete saved.minRouteConfidence;
  expect(RetrievalConfigSchema.parse(saved)).toMatchObject({ scopeRouter: "rewriter", minRouteConfidence: 0.8 });
  expect(RetrievalConfigSchema.parse({ scopeRouter: "decision" }).scopeRouter).toBe("decision");
  expect(RetrievalConfigSchema.safeParse({ scopeRouter: "llm" }).success).toBe(false);
});

test("minRouteConfidence accepts 0.5..1", () => {
  expect(RetrievalConfigSchema.safeParse({ minRouteConfidence: 0.5 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ minRouteConfidence: 0.87 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ minRouteConfidence: 1 }).success).toBe(true);
  expect(RetrievalConfigSchema.safeParse({ minRouteConfidence: 0.49 }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ minRouteConfidence: 1.01 }).success).toBe(false);
});

test("unknown modes and unknown keys are rejected", () => {
  expect(RetrievalConfigSchema.safeParse({ rewrite: "hyde" }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ search: "fuzzy" }).success).toBe(false);
  expect(RetrievalConfigSchema.safeParse({ topK: 5 }).success).toBe(false);
});

test("presets set rewriting, search, reranking and scope routing on top of the defaults", () => {
  const shapes = RETRIEVAL_PRESET_NAMES.map((name) => {
    const { rewrite, search, rerank, scopeRouter, ...rest } = RETRIEVAL_PRESETS[name];
    expect(rest).toEqual({
      candidatesPerSearch: 20,
      rrfK: 60,
      fusedLimit: 20,
      finalK: 5,
      minRerankScore: 0,
      ignoreSubjectInLexical: true,
      ignoreSubjectInRerank: true,
      dropBelowMeanRerank: true,
      meanCutoffFactor: 0.5,
      minRouteConfidence: 0.8,
    });
    return [name, rewrite, search, rerank, scopeRouter];
  });
  expect(shapes).toEqual([
    ["vector-only", "none", "vector", false, "rewriter"],
    ["lexical-only", "none", "lexical", false, "rewriter"],
    ["hybrid", "none", "hybrid", false, "rewriter"],
    ["hybrid-rerank", "none", "hybrid", true, "rewriter"],
    ["hybrid-rerank-rewrite", "standalone", "hybrid", true, "rewriter"],
    ["hybrid-rerank-rewrite-route", "standalone", "hybrid", true, "decision"],
    ["full", "multi", "hybrid", true, "rewriter"],
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
