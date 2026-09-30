import type { ChatFeedback } from "@/server/domain/chat";
import type { QueryScope, RetrievalTraceKind } from "@/server/domain/rag";
import type { TraceView } from "@/server/rag/pipeline/trace-reader";

// One line of the trace history: what was asked, what retrieval made of it, what it cost.
export type TraceSummary = {
  id: string;
  kind: RetrievalTraceKind;
  createdAt: string;
  // Null when no stage recorded the message (a router short-circuit skips the rewrite).
  question: string | null;
  // The first search query, when it differs from the question.
  rewritten: string | null;
  scope: QueryScope | null;
  sourceTitles: string[];
  totalMs: number;
  // Null for traces without a generate stage (playground runs, off-topic replies).
  answerTokens: number | null;
  // Chat traces only; null until the visitor rates the answer.
  feedback: ChatFeedback | null;
  // The name of the first stage that failed.
  failedStage: string | null;
};

export function summarizeTrace(view: TraceView, feedback: ChatFeedback | null = null): TraceSummary {
  let question: string | null = null;
  let rewritten: string | null = null;
  let scope: QueryScope | null = null;
  let answerTokens: number | null = null;

  for (const { detail } of view.stages) {
    if (detail.kind === "route" && detail.output.scope !== null) scope = detail.output.scope;
    if (detail.kind === "rewrite") {
      question = detail.input.message;
      scope = detail.output.scope;
      const first = detail.output.queries[0];
      rewritten = first !== undefined && first !== question ? first : null;
    }
    if (detail.kind === "generate") {
      answerTokens = detail.output.usage?.completionTokens ?? null;
    }
  }

  return {
    id: view.id,
    kind: view.kind,
    createdAt: view.createdAt,
    question,
    rewritten,
    scope,
    sourceTitles: view.sources.map((source) => source.title),
    totalMs: view.totalMs,
    answerTokens,
    feedback,
    failedStage: view.stages.find((stage) => stage.error !== null)?.name ?? null,
  };
}
