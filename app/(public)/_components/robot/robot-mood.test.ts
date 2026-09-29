import { expect, test } from "bun:test";

import {
  INITIAL_CHAT_STATE,
  type AnswerStep,
  type AssistantEntry,
  type ChatState,
  type EmailDraftState,
  type UserEntry,
} from "@/app/(public)/_components/chat/chat-state";
import {
  lastScope,
  robotMood,
  ROBOT_MOODS,
  ROBOT_NAME,
} from "@/app/(public)/_components/robot/robot-mood";
import type { QueryScope } from "@/server/domain/rag";

const question: UserEntry = { id: "u1", role: "user", text: "What does Lwin do?" };

function answer(overrides: Partial<AssistantEntry> = {}): AssistantEntry {
  return {
    id: "a1",
    role: "assistant",
    text: "Lwin builds backends.",
    sources: [],
    status: "done",
    steps: [],
    reasoning: "",
    emailDraft: null,
    ...overrides,
  };
}

function draft(state: EmailDraftState): Partial<AssistantEntry> {
  return { emailDraft: { id: "d1", text: "Hello", state } };
}

function routeStep(scope: QueryScope | null): AnswerStep {
  return {
    name: "route",
    status: "done",
    startedAt: 0,
    durationMs: 10,
    detail: { kind: "route", scope: scope === "contact" ? null : scope, fallback: false },
  };
}

function rewriteStep(scope: QueryScope): AnswerStep {
  return {
    name: "rewrite",
    status: "done",
    startedAt: 10,
    durationMs: 10,
    detail: { kind: "rewrite", queries: [], scope, fallback: false },
  };
}

function chat(overrides: Partial<ChatState> = {}): ChatState {
  return { ...INITIAL_CHAT_STATE, conversationId: "c1", ...overrides };
}

function settled(entry: AssistantEntry, overrides: Partial<ChatState> = {}): ChatState {
  return chat({ entries: [question, entry], ...overrides });
}

function streaming(text: string): ChatState {
  return chat({ streaming: true, entries: [question, answer({ status: "streaming", text })] });
}

function mood(state: ChatState, flags: { typing?: boolean; greeting?: boolean } = {}) {
  return robotMood({ chat: state, typing: flags.typing ?? false, greeting: flags.greeting ?? false });
}

test("names the robot and lists every mood once", () => {
  expect(ROBOT_NAME).toBe("Bit");
  expect(new Set(ROBOT_MOODS).size).toBe(8);
});

test("an empty chat is idle, listening while the visitor types", () => {
  expect(mood(INITIAL_CHAT_STATE)).toBe("idle");
  expect(mood(INITIAL_CHAT_STATE, { typing: true })).toBe("listening");
});

test("waves while the greeting is open, over every other mood", () => {
  expect(mood(INITIAL_CHAT_STATE, { greeting: true })).toBe("waving");
  expect(mood(streaming("Lwin"), { greeting: true, typing: true })).toBe("waving");
});

test("thinks until answer text arrives, then talks", () => {
  expect(mood(streaming(""))).toBe("thinking");
  expect(mood(streaming("Lwin"))).toBe("talking");
});

test("thinks when streaming before the pending answer exists", () => {
  expect(mood(chat({ streaming: true, entries: [question] }))).toBe("thinking");
});

test("thinking and talking win over typing", () => {
  expect(mood(streaming(""), { typing: true })).toBe("thinking");
  expect(mood(streaming("Lwin"), { typing: true })).toBe("talking");
});

test("is sad under a notice, after a cut-off answer, and after a failed or limited email", () => {
  expect(mood(chat({ notice: "failed", entries: [question] }))).toBe("sad");
  expect(mood(settled(answer({ status: "interrupted" })))).toBe("sad");
  expect(mood(settled(answer(draft("failed"))))).toBe("sad");
  expect(mood(settled(answer(draft("limit"))))).toBe("sad");
});

test("typing wins over sad", () => {
  expect(mood(chat({ notice: "unavailable", entries: [question] }), { typing: true })).toBe(
    "listening",
  );
});

test("is happy once the answer's email is sent, and sad wins over it", () => {
  expect(mood(settled(answer(draft("sent"))))).toBe("happy");
  expect(mood(settled(answer(draft("sent")), { notice: "daily_limit" }))).toBe("sad");
});

test("other draft states leave the robot idle", () => {
  for (const state of ["pending", "sending", "expired", "discarded", "superseded"] as const) {
    expect(mood(settled(answer(draft(state))))).toBe("idle");
  }
});

test("is puzzled after an off-topic question, below happy and sad", () => {
  const offTopic = { steps: [routeStep("off_topic")] };
  expect(mood(settled(answer(offTopic)))).toBe("puzzled");
  expect(mood(settled(answer({ ...offTopic, ...draft("sent") })))).toBe("happy");
  expect(mood(settled(answer({ ...offTopic, status: "interrupted" })))).toBe("sad");
});

test("a stopped answer or one about the CV is idle", () => {
  expect(mood(settled(answer({ status: "stopped", text: "" })))).toBe("idle");
  expect(mood(settled(answer({ steps: [routeStep(null), rewriteStep("cv")] })))).toBe("idle");
});

test("only the final entry counts as the last answer", () => {
  const older = answer(draft("sent"));
  expect(mood(chat({ entries: [question, older, { ...question, id: "u2" }] }))).toBe("idle");
});

test("a restored chat shows the mood of its last answer", () => {
  const restored = chat({
    entries: [question, answer({ id: "a1" }), { ...question, id: "u2" }, answer(draft("sent"))],
  });
  expect(mood(restored)).toBe("happy");
});

test("the scope comes from the route step, else the rewrite step", () => {
  expect(lastScope(answer({ steps: [routeStep("off_topic")] }))).toBe("off_topic");
  expect(lastScope(answer({ steps: [routeStep("smalltalk"), rewriteStep("cv")] }))).toBe(
    "smalltalk",
  );
  expect(lastScope(answer({ steps: [routeStep(null), rewriteStep("off_topic")] }))).toBe(
    "off_topic",
  );
  expect(lastScope(answer({ steps: [rewriteStep("contact")] }))).toBe("contact");
});

test("a legacy entry with no steps has no scope and is idle", () => {
  const legacy = answer({ steps: [] });
  expect(lastScope(legacy)).toBeNull();
  expect(mood(settled(legacy))).toBe("idle");
});

test("steps without a detail give no scope", () => {
  const bare: AnswerStep = { name: "route", status: "stopped", startedAt: 0, durationMs: null, detail: null };
  expect(lastScope(answer({ steps: [bare] }))).toBeNull();
});
