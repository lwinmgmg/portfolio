import { z } from "zod";

import type { ToolCallOutcome } from "@/server/domain/chat";
import type { QueryScope, RouteScope } from "@/server/domain/rag";

// What each retrieval stage writes to the trace. The pipeline builds these shapes and the trace
// reader parses stored traces with the same schemas, so the two cannot drift apart.

export const STAGE = {
  // Only with `scopeRouter: "decision"`, before the rewrite.
  route: "route",
  rewrite: "rewrite",
  embedQueries: "embed-queries",
  vectorSearch: "vector-search",
  lexicalSearch: "lexical-search",
  fuse: "fuse",
  rerank: "rerank",
  filter: "filter",
  // Added by the chat service after retrieval. Not recorded by the pipeline.
  generate: "generate",
  // One per tool call the answer model made (Phase 4), also added by the chat service.
  tool: "tool",
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

const ScopeSchema = z.enum(["cv", "smalltalk", "off_topic", "contact", "injection"]) satisfies z.ZodType<QueryScope>;
const RouteScopeSchema = z.enum(["cv", "smalltalk", "off_topic"]) satisfies z.ZodType<RouteScope>;

export const RouteStageInputSchema = z.object({
  // The model asked. The output names the one that answered.
  model: z.string(),
  minConfidence: z.number(),
  historyTurns: z.number(),
});

export const RouteStageOutputSchema = z.object({
  // Set only for a short-circuit; null means the rewriter decided.
  scope: z.enum(["smalltalk", "off_topic"]).nullable(),
  probabilities: z.object({ cv: z.number(), smalltalk: z.number(), off_topic: z.number() }).nullable(),
  choice: RouteScopeSchema.nullable(),
  model: z.string().nullable(),
  fallback: z.boolean(),
  error: z.string().nullable(),
});

export const RewriteStageInputSchema = z.object({
  message: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
  mode: z.enum(["none", "standalone", "multi"]),
  subjectName: z.string(),
});

export const RewriteStageOutputSchema = z.object({
  queries: z.array(z.string()),
  scope: ScopeSchema,
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
  // Lexical only: BM25 dropped the query terms of this text (the subject's name). Absent in
  // traces written before Phase 2.10b.
  ignoredTermsOf: z.string().optional(),
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
  // This name (the subject's) was removed from the query and every candidate text. Absent when
  // the toggle is off and in traces written before Phase 2.10c.
  ignoredName: z.string().optional(),
});

export const FilterStageOutputSchema = z.object({
  minRerankScore: z.number(),
  // The mean of the reranked scores; hits below it were dropped too. Absent when the toggle is
  // off and in traces written before Phase 2.10d.
  meanRerankScore: z.number().optional(),
  kept: z.number(),
  dropped: z.array(TracedHitSchema),
});

export const GenerateStageInputSchema = z.object({
  model: z.string(),
  // `cv` answers from sources; `contact` drafts a message to the subject. `smalltalk` is only in
  // traces from before small talk got a fixed reply; it stays so those traces still parse.
  mode: z.enum(["cv", "smalltalk", "contact"]),
  sources: z.number(),
  historyTurns: z.number(),
  // The tools offered. Absent in traces written before Phase 4.3.
  tools: z.array(z.string()).optional(),
  // Whether the prompt carried the conversation's pending email draft. Absent before 4.3.
  pendingDraft: z.boolean().optional(),
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
  // Model calls: 2 when a tool ran between them. Absent in traces written before Phase 4.3.
  rounds: z.number().optional(),
});

export const ToolStageInputSchema = z.object({
  name: z.string(),
  // The model's raw arguments. For send_email this holds the draft text: traces are admin-only.
  arguments: z.string(),
});

export const ToolStageOutputSchema = z.object({
  outcome: z.enum([
    "drafted",
    "invalid",
    "unknown_tool",
    "ignored",
    "failed",
  ]) satisfies z.ZodType<ToolCallOutcome>,
  draftId: z.string().nullable(),
});

export type RouteStageInput = z.infer<typeof RouteStageInputSchema>;
export type RouteStageOutput = z.infer<typeof RouteStageOutputSchema>;
export type RewriteStageInput = z.infer<typeof RewriteStageInputSchema>;
export type RewriteStageOutput = z.infer<typeof RewriteStageOutputSchema>;
export type EmbedStageOutput = z.infer<typeof EmbedStageOutputSchema>;
export type SearchStageOutput = z.infer<typeof SearchStageOutputSchema>;
export type FuseStageOutput = z.infer<typeof FuseStageOutputSchema>;
export type RerankStageOutput = z.infer<typeof RerankStageOutputSchema>;
export type FilterStageOutput = z.infer<typeof FilterStageOutputSchema>;
export type GenerateStageInput = z.infer<typeof GenerateStageInputSchema>;
export type GenerateStageOutput = z.infer<typeof GenerateStageOutputSchema>;
export type ToolStageInput = z.infer<typeof ToolStageInputSchema>;
export type ToolStageOutput = z.infer<typeof ToolStageOutputSchema>;
