import type { z } from "zod";

import type { RetrievalTrace, TraceStage } from "@/server/domain/rag";
import {
  EmbedStageOutputSchema,
  FilterStageOutputSchema,
  FuseStageOutputSchema,
  RerankStageOutputSchema,
  RewriteStageInputSchema,
  RewriteStageOutputSchema,
  SearchStageOutputSchema,
  STAGE,
  type EmbedStageOutput,
  type FilterStageOutput,
  type FuseStageOutput,
  type RerankStageOutput,
  type RewriteStageInput,
  type RewriteStageOutput,
  type SearchStageOutput,
} from "@/server/rag/pipeline/trace-stages";

export type StageTiming = {
  name: string;
  startedAt: number;
  durationMs: number;
  error: string | null;
};

export type StageDetail =
  | { kind: "rewrite"; input: RewriteStageInput; output: RewriteStageOutput }
  | { kind: "embed"; output: EmbedStageOutput }
  | { kind: "search"; output: SearchStageOutput }
  | { kind: "fuse"; output: FuseStageOutput }
  | { kind: "rerank"; output: RerankStageOutput }
  | { kind: "filter"; output: FilterStageOutput }
  // A failed stage, a stage this reader does not know, or one whose stored shape changed.
  | { kind: "raw"; input: string; output: string };

export type StageView = StageTiming & { detail: StageDetail };

// A trace ready to render: plain data with typed stages, so it can cross to a client component.
export type TraceView = Omit<RetrievalTrace, "stages"> & { stages: StageView[] };

export function readTrace(trace: RetrievalTrace): TraceView {
  return {
    ...trace,
    config: { ...trace.config },
    sources: trace.sources.map((source) => ({ ...source, entityKeys: [...source.entityKeys] })),
    stages: trace.stages.map(readStage),
  };
}

function readStage(stage: TraceStage): StageView {
  const timing: StageTiming = {
    name: stage.name,
    startedAt: stage.startedAt,
    durationMs: stage.durationMs,
    error: stage.error,
  };
  return { ...timing, detail: (stage.error === null && detailOf(stage)) || rawDetail(stage) };
}

function detailOf(stage: TraceStage): StageDetail | null {
  switch (stage.name) {
    case STAGE.rewrite: {
      const input = parsed(RewriteStageInputSchema, stage.input);
      const output = parsed(RewriteStageOutputSchema, stage.output);
      return input && output ? { kind: "rewrite", input, output } : null;
    }
    case STAGE.embedQueries:
      return withOutput("embed", EmbedStageOutputSchema, stage.output);
    case STAGE.vectorSearch:
    case STAGE.lexicalSearch:
      return withOutput("search", SearchStageOutputSchema, stage.output);
    case STAGE.fuse:
      return withOutput("fuse", FuseStageOutputSchema, stage.output);
    case STAGE.rerank:
      return withOutput("rerank", RerankStageOutputSchema, stage.output);
    case STAGE.filter:
      return withOutput("filter", FilterStageOutputSchema, stage.output);
    default:
      return null;
  }
}

function withOutput<K extends StageDetail["kind"], S extends z.ZodType>(
  kind: K,
  schema: S,
  value: unknown,
): { kind: K; output: z.infer<S> } | null {
  const output = parsed(schema, value);
  return output === null ? null : { kind, output };
}

function parsed<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function rawDetail(stage: TraceStage): StageDetail {
  return { kind: "raw", input: toJson(stage.input), output: toJson(stage.output) };
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch {
    return String(value);
  }
}
