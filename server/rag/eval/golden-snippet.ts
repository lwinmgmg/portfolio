import type { ChatTurn } from "@/server/domain/chat";
import type { TraceView } from "@/server/rag/pipeline/trace-reader";

// A golden-set item (evals/cv-retrieval.golden.json) drafted from a trace. The entity keys are
// what the pipeline returned, so the owner keeps only the ones that should have been found.
export type GoldenSnippet = {
  id: string;
  question: string;
  history: ChatTurn[];
  expectedScope?: "smalltalk" | "off_topic" | "contact";
  relevantEntityKeys: string[];
  tags: string[];
};

// Null when the trace never recorded the question (nothing to build an item from).
export function goldenSnippetFor(view: TraceView): GoldenSnippet | null {
  const rewrite = view.stages.find((stage) => stage.detail.kind === "rewrite")?.detail;
  if (rewrite?.kind !== "rewrite") return null;
  const { message, history } = rewrite.input;
  const scope = rewrite.output.scope;
  const entityKeys = [...new Set(view.sources.flatMap((source) => source.entityKeys))];
  return {
    id: `trace-${view.id.slice(0, 8)}`,
    question: message,
    history: history.map((turn) => ({ role: turn.role, text: turn.text })),
    ...(scope === "smalltalk" || scope === "off_topic" || scope === "contact"
      ? { expectedScope: scope }
      : {}),
    relevantEntityKeys: entityKeys,
    tags: ["from-trace"],
  };
}
