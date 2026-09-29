import type {
  QueryRewriteMode,
  RetrievalConfig,
  ScopeRouterKind,
  SearchMode,
} from "@/server/domain/rag";

// The retrieval config's choices and bounds, without zod, so the client playground form can
// import them. `retrieval-config.ts` builds its schema from the same values.

export const QUERY_REWRITE_MODES = ["none", "standalone", "multi"] as const satisfies readonly QueryRewriteMode[];

export const SEARCH_MODES = ["vector", "lexical", "hybrid"] as const satisfies readonly SearchMode[];

export const SCOPE_ROUTERS = ["rewriter", "decision"] as const satisfies readonly ScopeRouterKind[];

export type NumberField = { min: number; max: number; step: number; default: number };

export type RetrievalNumberFieldName = {
  [K in keyof RetrievalConfig]: RetrievalConfig[K] extends number ? K : never;
}[keyof RetrievalConfig];

export const RETRIEVAL_NUMBER_FIELDS: Readonly<Record<RetrievalNumberFieldName, NumberField>> = {
  candidatesPerSearch: { min: 1, max: 50, step: 1, default: 20 },
  rrfK: { min: 1, max: 200, step: 1, default: 60 },
  fusedLimit: { min: 1, max: 50, step: 1, default: 20 },
  finalK: { min: 1, max: 10, step: 1, default: 5 },
  minRerankScore: { min: 0, max: 1, step: 0.01, default: 0 },
  meanCutoffFactor: { min: 0, max: 1, step: 0.05, default: 0.5 },
  // Below 0.5 a choice need not be the most likely option.
  minRouteConfidence: { min: 0.5, max: 1, step: 0.01, default: 0.8 },
};

export const RETRIEVAL_FIELD_LABELS: Readonly<Record<keyof RetrievalConfig, string>> = {
  rewrite: "Query rewrite",
  search: "Search",
  candidatesPerSearch: "Candidates per search",
  rrfK: "RRF k",
  fusedLimit: "Fused limit",
  rerank: "Rerank",
  finalK: "Final k",
  minRerankScore: "Min rerank score",
  ignoreSubjectInLexical: "Ignore name in BM25",
  ignoreSubjectInRerank: "Ignore name in rerank",
  dropBelowMeanRerank: "Drop below mean rerank",
  meanCutoffFactor: "Mean cutoff factor",
  scopeRouter: "Scope router",
  minRouteConfidence: "Min route confidence",
};
