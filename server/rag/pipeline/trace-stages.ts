import { z } from "zod";

// What each retrieval stage writes to the trace. The pipeline builds these shapes and the trace
// reader parses stored traces with the same schemas, so the two cannot drift apart.

export const STAGE = {
  rewrite: "rewrite",
  embedQueries: "embed-queries",
  vectorSearch: "vector-search",
  lexicalSearch: "lexical-search",
  fuse: "fuse",
  rerank: "rerank",
  filter: "filter",
  // Added by the chat service after retrieval. Not recorded by the pipeline.
  generate: "generate",
} as const;

// Names of the lists that fusion merges, e.g. `vector:q0` and `bm25:q1`.
export function hitListName(kind: "vector" | "bm25", queryIndex: number): string {
  return `${kind}:q${queryIndex}`;
}

// A hit with enough of its chunk to read the trace without the index.
const TracedHitSchema = z.object({
  chunkId: z.string(),
  rank: z.number(),
  score: z.number(),
  title: z.string(),
  section: z.string(),
  entityKeys: z.array(z.string()),
});

export type TracedHit = z.infer<typeof TracedHitSchema>;

export const RewriteStageInputSchema = z.object({
  message: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
  mode: z.enum(["none", "standalone", "multi"]),
  subjectName: z.string(),
});

export const RewriteStageOutputSchema = z.object({
  queries: z.array(z.string()),
  scope: z.enum(["cv", "smalltalk", "off_topic"]),
  raw: z.unknown(),
});

export const EmbedStageOutputSchema = z.object({
  model: z.string(),
  count: z.number(),
  dimensions: z.number(),
});

export const SearchStageOutputSchema = z.object({
  lists: z.array(
    z.object({ name: z.string(), query: z.string(), hits: z.array(TracedHitSchema) }),
  ),
});

export const FuseStageOutputSchema = z.object({
  // Chunks fused before the cut to `fusedLimit`.
  total: z.number(),
  // `rank` is the fused rank and `score` the RRF score.
  hits: z.array(
    TracedHitSchema.extend({
      contributions: z.array(z.object({ list: z.string(), rank: z.number() })),
    }),
  ),
});

export const RerankStageOutputSchema = z.object({
  fallback: z.boolean(),
  error: z.string().nullable(),
  // `rank` is the reranked rank, `score` the rerank score.
  hits: z.array(TracedHitSchema.extend({ fusedRank: z.number() })),
});

export const FilterStageOutputSchema = z.object({
  minRerankScore: z.number(),
  kept: z.number(),
  dropped: z.array(TracedHitSchema),
});

export const GenerateStageInputSchema = z.object({
  model: z.string(),
  // `cv` answers from sources; `smalltalk` replies without them.
  mode: z.enum(["cv", "smalltalk"]),
  sources: z.number(),
  historyTurns: z.number(),
});

export const GenerateStageOutputSchema = z.object({
  model: z.string(),
  usage: z
    .object({ promptTokens: z.number(), completionTokens: z.number(), cost: z.number().nullable() })
    .nullable(),
  // The answer as streamed, before any `[stopped]` suffix. Partial when stopped or failed.
  answer: z.string(),
  stopped: z.boolean(),
  citedSourceIds: z.array(z.string()),
  // The model's reasoning, capped at CHAT_REASONING_MAX_CHARS. Null when it sent none; older
  // traces have no key.
  reasoning: z.string().nullable().optional(),
});

export type RewriteStageInput = z.infer<typeof RewriteStageInputSchema>;
export type RewriteStageOutput = z.infer<typeof RewriteStageOutputSchema>;
export type EmbedStageOutput = z.infer<typeof EmbedStageOutputSchema>;
export type SearchStageOutput = z.infer<typeof SearchStageOutputSchema>;
export type FuseStageOutput = z.infer<typeof FuseStageOutputSchema>;
export type RerankStageOutput = z.infer<typeof RerankStageOutputSchema>;
export type FilterStageOutput = z.infer<typeof FilterStageOutputSchema>;
export type GenerateStageInput = z.infer<typeof GenerateStageInputSchema>;
export type GenerateStageOutput = z.infer<typeof GenerateStageOutputSchema>;
