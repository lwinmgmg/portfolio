import type { AnswerStep, AssistantEntry } from "@/app/(public)/_components/chat/chat-state";
import type { ChatStepDetail, ChatStepName, ToolCallOutcome } from "@/server/domain/chat";
import type { QueryScope } from "@/server/domain/rag";

// Words for the steps panel. Pure, so the wording is tested apart from the components.

type StepWords = {
  // What the step is doing: "Searching the CV". Shown with "…" while running, and as is when
  // the step failed or was stopped.
  active: string;
  // What it did: "Semantic search".
  done: string;
};

const STEP_WORDS: Record<ChatStepName, StepWords> = {
  route: { active: "Reading your message", done: "Read your message" },
  rewrite: { active: "Understanding the question", done: "Understood the question" },
  "embed-queries": { active: "Preparing the search", done: "Prepared the search" },
  "vector-search": { active: "Searching the CV", done: "Semantic search" },
  "lexical-search": { active: "Searching for keywords", done: "Keyword search" },
  fuse: { active: "Combining results", done: "Combined results (RRF)" },
  rerank: { active: "Reranking results", done: "Reranked" },
  filter: { active: "Dropping weak matches", done: "Dropped weak matches" },
  reasoning: { active: "Thinking", done: "Thought it through" },
  generate: { active: "Writing the answer", done: "Wrote the answer" },
  tool: { active: "Drafting an email", done: "Drafted an email" },
};

export function stepLabel(step: AnswerStep): string {
  const words = STEP_WORDS[step.name];
  switch (step.status) {
    case "running":
      return `${words.active}…`;
    case "done":
      return words.done;
    case "failed":
    case "stopped":
      return words.active;
  }
}

// The kinds of score a step can show. Each is formatted and explained on its own terms.
export type ScoreScale = "cosine" | "bm25" | "rrf" | "rerank";

const SCORE_DECIMALS: Record<ScoreScale, number> = { cosine: 2, bm25: 2, rrf: 4, rerank: 2 };

export const SCORE_HINTS: Record<ScoreScale, string> = {
  cosine: "Scores are cosine similarity, 0–1: higher means closer in meaning.",
  bm25: "Scores are BM25 keyword scores: higher is better, with no fixed top.",
  rrf: "Scores are reciprocal rank fusion: each list adds more the higher it ranked the chunk.",
  rerank: "Scores are the reranker's relevance, 0–1: higher is better.",
};

export function formatScore(score: number, scale: ScoreScale): string {
  return score.toFixed(SCORE_DECIMALS[scale]);
}

export function searchScale(method: "vector" | "bm25"): ScoreScale {
  return method === "vector" ? "cosine" : "bm25";
}

const SCOPE_LABELS: Record<QueryScope, string> = {
  cv: "About the CV",
  smalltalk: "Small talk",
  off_topic: "Out of scope",
  contact: "Contact request",
};

export function scopeLabel(scope: QueryScope): string {
  return SCOPE_LABELS[scope];
}

// One line beside the step's label. Empty when there is nothing to add: a running, failed or
// stopped step, a step whose detail could not be read, and the reasoning step.
export function stepSummary(step: AnswerStep): string {
  return step.detail ? detailSummary(step.detail) : "";
}

function detailSummary(detail: ChatStepDetail): string {
  switch (detail.kind) {
    // A deferral (or a router failure, which the visitor need not see) goes on to the rewrite.
    case "route":
      return detail.scope === null ? "Checking your question" : scopeLabel(detail.scope);
    case "rewrite":
      if (detail.scope !== "cv") return scopeLabel(detail.scope);
      return queriesSummary(detail.queries);
    case "embed":
      return count(detail.count, "query", "queries");
    case "search": {
      const scores = detail.lists.flatMap((list) => list.hits.map((hit) => hit.score));
      if (scores.length === 0) return "No matches";
      const found =
        detail.lists.length === 1
          ? count(detail.lists[0]?.total ?? 0, "chunk", "chunks")
          : count(detail.lists.length, "query", "queries");
      return `${found} · best ${formatScore(Math.max(...scores), searchScale(detail.method))}`;
    }
    case "fuse":
      return `${count(detail.total, "chunk", "chunks")} combined`;
    case "rerank": {
      if (detail.fallback) return "Kept the combined order";
      const best = detail.hits[0];
      const kept = `kept ${detail.hits.length}`;
      return best ? `${kept} · best ${formatScore(best.score, "rerank")}` : kept;
    }
    case "filter":
      return detail.dropped.length === 0
        ? `kept ${detail.kept}`
        : `kept ${detail.kept} · dropped ${detail.dropped.length}`;
    case "reasoning":
      return "";
    case "generate":
      return detail.sources === 0 ? "No sources" : count(detail.sources, "source", "sources");
    case "tool":
      return detail.outcome === "drafted" ? detail.name : "Nothing drafted";
  }
}

// The expanded tool row. Never the draft: the card under the answer shows that.
export function toolDetailText(outcome: ToolCallOutcome): string {
  return outcome === "drafted"
    ? "Waiting for you to press Send."
    : "The email could not be drafted.";
}

function queriesSummary(queries: readonly string[]): string {
  const [first] = queries;
  if (first === undefined) return "";
  const quoted = `“${first}”`;
  return queries.length === 1 ? quoted : `${quoted} +${queries.length - 1} more`;
}

// "0.8 s": tenths are as fine as a visitor can use.
export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function stepDuration(step: AnswerStep): string | null {
  return step.durationMs === null ? null : formatDuration(step.durationMs);
}

// From the first step's start to the last step's end. A step with no end counts its start.
export function elapsedMs(steps: readonly AnswerStep[]): number {
  if (steps.length === 0) return 0;
  const start = Math.min(...steps.map((step) => step.startedAt));
  const end = Math.max(...steps.map((step) => step.startedAt + (step.durationMs ?? 0)));
  return end - start;
}

// The panel's own summary line: the step in progress while streaming, then how the work ended.
export function activityHeading(entry: AssistantEntry): string {
  if (entry.status === "streaming") {
    const current = latestRunning(entry.steps);
    return current ? stepLabel(current) : "Working…";
  }
  const took = formatDuration(elapsedMs(entry.steps));
  if (entry.status === "stopped") return `Stopped after ${took}`;
  if (entry.steps.some((step) => step.status === "failed")) return `Failed after ${took}`;
  if (entry.status === "interrupted") return `Cut off after ${took}`;
  const sources = entry.sources?.length ?? 0;
  return sources === 0
    ? `Worked for ${took}`
    : `Worked for ${took} · ${count(sources, "source", "sources")}`;
}

// What a screen reader is told as the steps change. Only step changes, never answer tokens, so
// the log's own announcement of the finished answer is not drowned out.
export function stepAnnouncement(steps: readonly AnswerStep[]): string {
  const current = latestRunning(steps);
  if (current) return STEP_WORDS[current.name].active;
  const last = steps.at(-1);
  return last?.status === "failed" ? `${STEP_WORDS[last.name].active} failed` : "";
}

// Search stages can run side by side; the one started last is the one to show.
function latestRunning(steps: readonly AnswerStep[]): AnswerStep | undefined {
  return steps.findLast((step) => step.status === "running");
}

// "vector:q0 #3, bm25:q0 #1": which lists found a fused chunk, and at what rank.
export function contributionsText(
  contributions: readonly { list: string; rank: number }[],
): string {
  return contributions.map(({ list, rank }) => `${list} #${rank}`).join(", ");
}

// The note under a cut list, or null when every hit is shown.
export function moreText(total: number, shown: number): string | null {
  return total > shown ? `and ${total - shown} more` : null;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
