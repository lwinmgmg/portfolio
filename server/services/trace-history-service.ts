import type { ChatFeedback, MessageFeedbackStore } from "@/server/domain/chat";
import type { RagTraceRepository, RetrievalTraceKind } from "@/server/domain/rag";
import { goldenSnippetFor, type GoldenSnippet } from "@/server/rag/eval/golden-snippet";
import { readTrace, type TraceView } from "@/server/rag/pipeline/trace-reader";
import { summarizeTrace, type TraceSummary } from "@/server/rag/pipeline/trace-summary";

// Rows on the history page.
export const TRACE_HISTORY_LIMIT = 100;

export type TraceHistoryFilter = { kind?: RetrievalTraceKind; feedback?: "down" };

export type TraceDetail = {
  view: TraceView;
  summary: TraceSummary;
  // Null when the trace never recorded the question.
  golden: GoldenSnippet | null;
};

// The admin's look at past traces: the list, and one trace with its answer's feedback.
export class TraceHistoryService {
  constructor(
    private readonly deps: {
      traces: Pick<RagTraceRepository, "list" | "findById">;
      feedback: Pick<MessageFeedbackStore, "feedbackByTraceId" | "traceIdsWithFeedback">;
    },
  ) {}

  async list(filter: TraceHistoryFilter = {}): Promise<TraceSummary[]> {
    const { traces, feedback } = this.deps;
    const ids = filter.feedback
      ? await feedback.traceIdsWithFeedback(filter.feedback, TRACE_HISTORY_LIMIT)
      : undefined;
    // Feedback exists only on chat traces, so that filter implies the chat kind.
    const kind = filter.feedback ? "chat" : filter.kind;
    const found = await traces.list(TRACE_HISTORY_LIMIT, {
      ...(kind ? { kind } : {}),
      ...(ids ? { ids } : {}),
    });
    const rated = await feedback.feedbackByTraceId(found.map((trace) => trace.id));
    return found.map((trace) => summarizeTrace(readTrace(trace), rated.get(trace.id) ?? null));
  }

  async get(id: string): Promise<TraceDetail | null> {
    const trace = await this.deps.traces.findById(id);
    if (!trace) return null;
    const rated: Map<string, ChatFeedback> = await this.deps.feedback.feedbackByTraceId([id]);
    const view = readTrace(trace);
    return { view, summary: summarizeTrace(view, rated.get(id) ?? null), golden: goldenSnippetFor(view) };
  }
}
