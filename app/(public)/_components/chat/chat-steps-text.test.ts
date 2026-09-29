import { expect, test } from "bun:test";

import type { AnswerStep, AssistantEntry } from "@/app/(public)/_components/chat/chat-state";
import {
  activityHeading,
  contributionsText,
  elapsedMs,
  formatDuration,
  formatScore,
  moreText,
  stepAnnouncement,
  stepDuration,
  stepLabel,
  stepSummary,
  toolDetailText,
} from "@/app/(public)/_components/chat/chat-steps-text";
import type { ChatStepDetail, ChatStepHit, ChatStepName } from "@/server/domain/chat";

function hit(rank: number, score: number): ChatStepHit {
  return { rank, score, title: `Chunk ${rank}`, section: "experience", anchor: null };
}

function step(
  name: ChatStepName,
  detail: ChatStepDetail | null = null,
  timing: { startedAt?: number; durationMs?: number | null } = {},
): AnswerStep {
  const { startedAt = 0, durationMs = 100 } = timing;
  return { name, status: "done", startedAt, durationMs, detail };
}

function running(name: ChatStepName, startedAt = 0): AnswerStep {
  return { name, status: "running", startedAt, durationMs: null, detail: null };
}

function entry(overrides: Partial<AssistantEntry>): AssistantEntry {
  return {
    id: "a1",
    role: "assistant",
    text: "",
    sources: null,
    status: "done",
    steps: [],
    reasoning: "",
    ...overrides,
  };
}

test("labels a step by what it is doing, did, or was doing when it ended", () => {
  expect(stepLabel(running("vector-search"))).toBe("Searching the CV…");
  expect(stepLabel(step("vector-search"))).toBe("Semantic search");
  expect(stepLabel({ ...step("rerank"), status: "failed" })).toBe("Reranking results");
  expect(stepLabel({ ...running("reasoning"), status: "stopped" })).toBe("Thinking");
});

test("summarizes the rewrite by its queries, or by its scope when not about the CV", () => {
  const rewrite = (queries: string[], scope: "cv" | "smalltalk" | "off_topic") =>
    stepSummary(step("rewrite", { kind: "rewrite", queries, scope, fallback: false }));
  expect(rewrite(["Lwin's backend experience"], "cv")).toBe("“Lwin's backend experience”");
  expect(rewrite(["Go projects", "Go experience", "Go skills"], "cv")).toBe("“Go projects” +2 more");
  expect(rewrite(["hello"], "smalltalk")).toBe("Small talk");
  expect(rewrite(["weather"], "off_topic")).toBe("Out of scope");
  expect(rewrite([], "cv")).toBe("");
});

test("summarizes the route by its short-circuit scope, or as a check when it deferred", () => {
  const route = (scope: "smalltalk" | "off_topic" | null, fallback = false) =>
    stepSummary(step("route", { kind: "route", scope, fallback }));
  expect(stepLabel(step("route"))).toBe("Read your message");
  expect(route("smalltalk")).toBe("Small talk");
  expect(route("off_topic")).toBe("Out of scope");
  expect(route(null)).toBe("Checking your question");
  expect(route(null, true)).toBe("Checking your question");
});

test("summarizes a search by its count and best score, in the method's precision", () => {
  const vector = stepSummary(
    step("vector-search", {
      kind: "search",
      method: "vector",
      lists: [{ query: "q", total: 20, hits: [hit(1, 0.8234), hit(2, 0.7)] }],
    }),
  );
  expect(vector).toBe("20 chunks · best 0.82");
  const lexical = stepSummary(
    step("lexical-search", {
      kind: "search",
      method: "bm25",
      lists: [
        { query: "a", total: 3, hits: [hit(1, 4.2)] },
        { query: "b", total: 1, hits: [hit(1, 7.3141)] },
      ],
    }),
  );
  expect(lexical).toBe("2 queries · best 7.31");
  const empty = step("lexical-search", {
    kind: "search",
    method: "bm25",
    lists: [{ query: "a", total: 0, hits: [] }],
  });
  expect(stepSummary(empty)).toBe("No matches");
});

test("summarizes fusion, reranking, the filter, embedding and the answer", () => {
  expect(stepSummary(step("fuse", { kind: "fuse", total: 24, hits: [] }))).toBe(
    "24 chunks combined",
  );
  const reranked = step("rerank", {
    kind: "rerank",
    fallback: false,
    hits: [{ ...hit(1, 0.912), fusedRank: 7 }, { ...hit(2, 0.4), fusedRank: 1 }],
  });
  expect(stepSummary(reranked)).toBe("kept 2 · best 0.91");
  expect(stepSummary(step("rerank", { kind: "rerank", fallback: false, hits: [] }))).toBe("kept 0");
  expect(stepSummary(step("rerank", { kind: "rerank", fallback: true, hits: [] }))).toBe(
    "Kept the combined order",
  );
  expect(
    stepSummary(step("filter", { kind: "filter", minScore: 0.3, kept: 5, dropped: [] })),
  ).toBe("kept 5");
  expect(
    stepSummary(step("filter", { kind: "filter", minScore: 0.3, kept: 3, dropped: [hit(4, 0.1)] })),
  ).toBe("kept 3 · dropped 1");
  expect(stepSummary(step("embed-queries", { kind: "embed", count: 1, dimensions: 8 }))).toBe(
    "1 query",
  );
  expect(stepSummary(step("generate", { kind: "generate", sources: 5 }))).toBe("5 sources");
  expect(stepSummary(step("generate", { kind: "generate", sources: 1 }))).toBe("1 source");
  expect(stepSummary(step("generate", { kind: "generate", sources: 0 }))).toBe("No sources");
});

test("the tool step reads as drafting an email and never shows the draft", () => {
  expect(stepLabel(running("tool"))).toBe("Drafting an email…");
  const drafted = step("tool", { kind: "tool", name: "send_email", outcome: "drafted" });
  expect(stepLabel(drafted)).toBe("Drafted an email");
  expect(stepSummary(drafted)).toBe("send_email");
  expect(stepSummary(step("tool", { kind: "tool", name: "send_email", outcome: "invalid" }))).toBe(
    "Nothing drafted",
  );
  expect(toolDetailText("drafted")).toBe("Waiting for you to press Send.");
  expect(toolDetailText("failed")).toBe("The email could not be drafted.");
});

test("a contact request is labelled as one", () => {
  expect(
    stepSummary(
      step("rewrite", { kind: "rewrite", queries: ["x"], scope: "contact", fallback: false }),
    ),
  ).toBe("Contact request");
});

test("says nothing extra for reasoning, a missing detail, or a running step", () => {
  expect(stepSummary(step("reasoning", { kind: "reasoning" }))).toBe("");
  expect(stepSummary(step("fuse"))).toBe("");
  expect(stepSummary(running("fuse"))).toBe("");
});

test("formats scores per kind and durations in tenths of a second", () => {
  expect(formatScore(0.8234, "cosine")).toBe("0.82");
  expect(formatScore(7.3141, "bm25")).toBe("7.31");
  expect(formatScore(0.032787, "rrf")).toBe("0.0328");
  expect(formatScore(0.9, "rerank")).toBe("0.90");
  expect(formatDuration(812)).toBe("0.8 s");
  expect(formatDuration(0)).toBe("0.0 s");
  expect(stepDuration(step("fuse", null, { durationMs: 3400 }))).toBe("3.4 s");
  expect(stepDuration(running("fuse"))).toBeNull();
});

test("measures the work from the first start to the last end", () => {
  const steps = [
    step("rewrite", null, { startedAt: 0, durationMs: 800 }),
    step("vector-search", null, { startedAt: 900, durationMs: 300 }),
    step("lexical-search", null, { startedAt: 900, durationMs: 10 }),
    { ...running("generate", 1500), status: "stopped" as const },
  ];
  expect(elapsedMs(steps)).toBe(1500);
  expect(elapsedMs([])).toBe(0);
});

test("heads the panel with the live step, then with how the work ended", () => {
  const rewrite = step("rewrite", null, { startedAt: 0, durationMs: 3400 });
  expect(activityHeading(entry({ status: "streaming", steps: [] }))).toBe("Working…");
  expect(
    activityHeading(
      entry({ status: "streaming", steps: [rewrite, running("vector-search"), running("lexical-search")] }),
    ),
  ).toBe("Searching for keywords…");
  expect(activityHeading(entry({ status: "streaming", steps: [rewrite] }))).toBe("Working…");

  const source = { sourceId: "S1", entityKeys: [], title: "A", section: "profile", anchor: null };
  expect(activityHeading(entry({ steps: [rewrite], sources: [source, source] }))).toBe(
    "Worked for 3.4 s · 2 sources",
  );
  expect(activityHeading(entry({ steps: [rewrite], sources: [] }))).toBe("Worked for 3.4 s");
  expect(activityHeading(entry({ steps: [rewrite], status: "stopped" }))).toBe(
    "Stopped after 3.4 s",
  );
  expect(activityHeading(entry({ steps: [rewrite], status: "interrupted" }))).toBe(
    "Cut off after 3.4 s",
  );
  const failed = { ...step("embed-queries", null, { startedAt: 3400, durationMs: 600 }), status: "failed" as const };
  expect(activityHeading(entry({ steps: [rewrite, failed], status: "interrupted" }))).toBe(
    "Failed after 4.0 s",
  );
});

test("announces only the step in progress, or the step that failed", () => {
  expect(stepAnnouncement([])).toBe("");
  expect(stepAnnouncement([step("fuse"), running("rerank")])).toBe("Reranking results");
  expect(stepAnnouncement([running("vector-search"), running("lexical-search")])).toBe(
    "Searching for keywords",
  );
  expect(stepAnnouncement([step("rewrite")])).toBe("");
  expect(stepAnnouncement([{ ...step("rerank"), status: "failed" }])).toBe(
    "Reranking results failed",
  );
});

test("writes fusion contributions and the rest of a cut list", () => {
  expect(
    contributionsText([
      { list: "vector:q0", rank: 3 },
      { list: "bm25:q0", rank: 1 },
    ]),
  ).toBe("vector:q0 #3, bm25:q0 #1");
  expect(moreText(20, 10)).toBe("and 10 more");
  expect(moreText(10, 10)).toBeNull();
});
