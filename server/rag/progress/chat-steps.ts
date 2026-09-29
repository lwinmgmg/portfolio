import type { z } from "zod";

import {
  CHAT_STEP_HITS,
  type ChatStep,
  type ChatStepDetail,
  type ChatStepHit,
  type ChatStepName,
} from "@/server/domain/chat";
import type { TraceStage } from "@/server/domain/rag";
import { entityAnchor } from "@/server/rag/answer/citations";
import {
  EmbedStageOutputSchema,
  FilterStageOutputSchema,
  FuseStageOutputSchema,
  GenerateStageInputSchema,
  RerankStageOutputSchema,
  RewriteStageOutputSchema,
  SearchStageOutputSchema,
  STAGE,
  type TracedHit,
} from "@/server/rag/pipeline/trace-stages";

// Projects trace stages into the steps a visitor sees. Each detail is built field by field from
// the parsed stage, so chunk text, contexts, the rewriter's raw output, model names and error
// messages cannot reach the visitor.

type DetailReader = (stage: TraceStage) => ChatStepDetail | null;

type StageName = (typeof STAGE)[keyof typeof STAGE];

// Typed by both STAGE and ChatStepName, so a stage added to one and not the other fails to compile.
const DETAIL_READERS: Record<StageName | "reasoning", DetailReader> = {
  [STAGE.rewrite]: (stage) =>
    read(RewriteStageOutputSchema, stage.output, ({ queries, scope, raw }) => ({
      kind: "rewrite",
      queries,
      scope,
      // After a fallback the rewriter keeps its error message as `raw`.
      fallback: typeof raw === "string",
    })),
  [STAGE.embedQueries]: (stage) =>
    read(EmbedStageOutputSchema, stage.output, ({ count, dimensions }) => ({
      kind: "embed",
      count,
      dimensions,
    })),
  [STAGE.vectorSearch]: (stage) => searchDetail("vector", stage),
  [STAGE.lexicalSearch]: (stage) => searchDetail("bm25", stage),
  [STAGE.fuse]: (stage) =>
    read(FuseStageOutputSchema, stage.output, ({ total, hits }) => ({
      kind: "fuse",
      total,
      hits: capped(hits).map((hit) => ({
        ...publicHit(hit),
        contributions: hit.contributions.map(({ list, rank }) => ({ list, rank })),
      })),
    })),
  [STAGE.rerank]: (stage) =>
    read(RerankStageOutputSchema, stage.output, ({ fallback, hits }) => ({
      kind: "rerank",
      fallback,
      hits: capped(hits).map((hit) => ({ ...publicHit(hit), fusedRank: hit.fusedRank })),
    })),
  [STAGE.filter]: (stage) =>
    read(FilterStageOutputSchema, stage.output, ({ minRerankScore, kept, dropped }) => ({
      kind: "filter",
      minScore: minRerankScore,
      kept,
      dropped: capped(dropped).map(publicHit),
    })),
  reasoning: () => ({ kind: "reasoning" }),
  // The sources count is known when generation starts, so it is read from the input.
  [STAGE.generate]: (stage) =>
    read(GenerateStageInputSchema, stage.input, ({ sources }) => ({ kind: "generate", sources })),
} satisfies Record<ChatStepName, DetailReader>;

export function isChatStepName(name: string): name is ChatStepName {
  return Object.hasOwn(DETAIL_READERS, name);
}

export function runningStep(name: ChatStepName, startedAt: number): ChatStep {
  return { name, status: "running", startedAt: wholeMs(startedAt), durationMs: null, detail: null };
}

// Null for a stage that is not a chat step. A failed stage gives no detail, so its error
// message stays in the trace.
export function finishedStep(stage: TraceStage): ChatStep | null {
  const { name } = stage;
  if (!isChatStepName(name)) return null;
  const failed = stage.error !== null;
  return {
    name,
    status: failed ? "failed" : "done",
    startedAt: wholeMs(stage.startedAt),
    durationMs: wholeMs(stage.durationMs),
    detail: failed ? null : DETAIL_READERS[name](stage),
  };
}

function searchDetail(method: "vector" | "bm25", stage: TraceStage): ChatStepDetail | null {
  return read(SearchStageOutputSchema, stage.output, ({ lists }) => ({
    kind: "search",
    method,
    lists: lists.map((list) => ({
      query: list.query,
      total: list.hits.length,
      hits: capped(list.hits).map(publicHit),
    })),
  }));
}

// Null when the stored shape does not parse, e.g. a stage written by an older version.
function read<S extends z.ZodType>(
  schema: S,
  value: unknown,
  project: (data: z.infer<S>) => ChatStepDetail,
): ChatStepDetail | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? project(parsed.data) : null;
}

function capped<T>(hits: readonly T[]): T[] {
  return hits.slice(0, CHAT_STEP_HITS);
}

function publicHit(hit: TracedHit): ChatStepHit {
  return {
    rank: hit.rank,
    score: hit.score,
    title: hit.title,
    section: hit.section,
    anchor: entityAnchor(hit.entityKeys),
  };
}

// Sub-millisecond precision means nothing to a visitor and only lengthens the payload.
function wholeMs(value: number): number {
  return Math.round(value);
}
