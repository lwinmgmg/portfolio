import { expect, test } from "bun:test";

import { parseChatEvent } from "@/client/api/chat";
import { parseChatStep, readChatStep } from "@/client/api/chat-steps";
import type { ChatStep, ChatStepDetail, ChatStepHit, ChatStepName } from "@/server/domain/chat";

const HIT: ChatStepHit = {
  rank: 1,
  score: 0.82,
  title: "Senior Engineer",
  section: "experience",
  anchor: "#experience-acme",
};

const LOOSE_HIT: ChatStepHit = { ...HIT, rank: 2, score: 0.4, anchor: null };

// One finished step of every kind, as the server sends them.
const DETAILS: Record<ChatStepName, ChatStepDetail> = {
  route: { kind: "route", scope: null, fallback: false },
  rewrite: { kind: "rewrite", queries: ["Jane backend work"], scope: "cv", fallback: false },
  "embed-queries": { kind: "embed", count: 1, dimensions: 1536 },
  "vector-search": {
    kind: "search",
    method: "vector",
    lists: [{ query: "Jane backend work", total: 20, hits: [HIT, LOOSE_HIT] }],
  },
  "lexical-search": {
    kind: "search",
    method: "bm25",
    lists: [{ query: "Jane backend work", total: 14, hits: [{ ...HIT, score: 7.31 }] }],
  },
  fuse: {
    kind: "fuse",
    total: 24,
    hits: [{ ...HIT, score: 0.0328, contributions: [{ list: "vector:q0", rank: 1 }] }],
  },
  rerank: { kind: "rerank", fallback: false, hits: [{ ...HIT, score: 0.91, fusedRank: 7 }] },
  filter: { kind: "filter", minScore: 0.2, kept: 5, dropped: [LOOSE_HIT] },
  reasoning: { kind: "reasoning" },
  generate: { kind: "generate", sources: 5 },
  tool: { kind: "tool", name: "send_email", outcome: "drafted" },
};

function done(name: ChatStepName, detail: ChatStepDetail | null = DETAILS[name]): ChatStep {
  return { name, status: "done", startedAt: 12, durationMs: 300, detail };
}

function withDetail(name: ChatStepName, detail: unknown): unknown {
  return { ...done(name), detail };
}

test("reads a finished step of every kind unchanged", () => {
  for (const name of Object.keys(DETAILS) as ChatStepName[]) {
    expect(parseChatStep(done(name))).toEqual(done(name));
  }
});

test("reads running and failed steps, which carry no detail", () => {
  const running: ChatStep = {
    name: "rerank",
    status: "running",
    startedAt: 0,
    durationMs: null,
    detail: null,
  };
  expect(parseChatStep(running)).toEqual(running);
  const failed: ChatStep = { ...running, status: "failed", durationMs: 40 };
  expect(parseChatStep(failed)).toEqual(failed);
});

test("skips a step with an unknown name, kind or status", () => {
  expect(parseChatStep({ ...done("rerank"), name: "summarize" })).toBeNull();
  expect(parseChatStep(withDetail("rerank", { kind: "chart", points: [] }))).toBeNull();
  expect(parseChatStep({ ...done("rerank"), status: "stopped" })).toBeNull();
  expect(parseChatStep({ ...done("rerank"), name: "toString" })).toBeNull();
});

test("skips a step whose own fields are missing or wrong", () => {
  expect(parseChatStep(null)).toBeNull();
  expect(parseChatStep([done("rerank")])).toBeNull();
  expect(parseChatStep({ ...done("rerank"), startedAt: "12" })).toBeNull();
  expect(parseChatStep({ ...done("rerank"), durationMs: undefined })).toBeNull();
});

test("a malformed detail becomes null and keeps the step", () => {
  const malformed: [ChatStepName, unknown][] = [
    ["rewrite", { ...DETAILS.rewrite, scope: "weather" }],
    ["rewrite", { ...DETAILS.rewrite, queries: "Jane" }],
    ["embed-queries", { kind: "embed", count: 1 }],
    ["vector-search", { ...DETAILS["vector-search"], method: "cosine" }],
    ["vector-search", { kind: "search", method: "vector", lists: [{ query: "q", hits: [] }] }],
    ["fuse", { kind: "fuse", total: 24, hits: [HIT] }],
    ["rerank", { kind: "rerank", fallback: false, hits: [HIT] }],
    ["filter", { kind: "filter", minScore: 0.2, kept: 5, dropped: [{ ...HIT, score: null }] }],
    ["generate", { kind: "generate", sources: "5" }],
    ["tool", { kind: "tool", name: "send_email", outcome: "sent" }],
    ["tool", { kind: "tool", outcome: "drafted" }],
    // A known kind on the wrong step.
    ["generate", DETAILS.reasoning],
    ["rerank", "kept 5"],
  ];
  for (const [name, detail] of malformed) {
    expect(parseChatStep(withDetail(name, detail))).toEqual(done(name, null));
  }
});

test("a hit anchor that is not a same-page fragment makes the detail malformed", () => {
  const detail = { ...DETAILS.filter, dropped: [{ ...HIT, anchor: "javascript:alert(1)" }] };
  expect(parseChatStep(withDetail("filter", detail))).toEqual(done("filter", null));
  const external = { ...DETAILS.rerank, hits: [{ ...HIT, fusedRank: 1, anchor: "https://x.io" }] };
  expect(parseChatStep(withDetail("rerank", external))).toEqual(done("rerank", null));
});

test("readChatStep accepts the statuses it is given", () => {
  const stopped = { ...done("generate"), status: "stopped", durationMs: null, detail: null };
  expect(readChatStep(stopped, ["done", "stopped"])).toEqual(stopped);
  expect(readChatStep(done("generate"), ["stopped"])).toBeNull();
});

test("parseChatEvent reads step and reasoning events", () => {
  expect(parseChatEvent({ type: "step", step: done("fuse") })).toEqual({
    type: "step",
    step: done("fuse"),
  });
  expect(parseChatEvent({ type: "step", step: withDetail("fuse", { kind: "fuse" }) })).toEqual({
    type: "step",
    step: done("fuse", null),
  });
  expect(parseChatEvent({ type: "step", step: { ...done("fuse"), name: "plan" } })).toBeNull();
  expect(parseChatEvent({ type: "step" })).toBeNull();
  expect(parseChatEvent({ type: "reasoning", text: "The CV lists" })).toEqual({
    type: "reasoning",
    text: "The CV lists",
  });
  expect(parseChatEvent({ type: "reasoning", text: null })).toBeNull();
});
