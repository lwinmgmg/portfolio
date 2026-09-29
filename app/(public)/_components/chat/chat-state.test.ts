import { expect, test } from "bun:test";

import {
  chatReducer,
  draftStateFor,
  EMAIL_DRAFT_STATES,
  INITIAL_CHAT_STATE,
  isDraftSendable,
  type AssistantEntry,
  type ChatAction,
  type ChatState,
} from "@/app/(public)/_components/chat/chat-state";
import type {
  ChatEvent,
  ChatSource,
  ChatStep,
  ChatStepDetail,
  ChatStepName,
} from "@/server/domain/chat";

const SOURCE: ChatSource = {
  sourceId: "S1",
  entityKeys: ["experience:acme"],
  title: "Senior Engineer",
  section: "experience",
  anchor: "#experience-acme",
};

function run(state: ChatState, ...actions: ChatAction[]): ChatState {
  return actions.reduce(chatReducer, state);
}

function send(text: string, n = 1): ChatAction {
  return { type: "send", text, userId: `u${n}`, assistantId: `a${n}` };
}

function event(value: ChatEvent): ChatAction {
  return { type: "event", event: value };
}

test("a streamed answer collects deltas and sources, then settles", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Where?"),
    event({ type: "meta", conversationId: "c1" }),
    event({ type: "delta", text: "At " }),
    event({ type: "delta", text: "Acme [S1]." }),
    event({ type: "sources", sources: [SOURCE] }),
    event({ type: "done" }),
    { type: "end", outcome: "complete" },
  );
  expect(state).toEqual({
    conversationId: "c1",
    streaming: false,
    notice: null,
    entries: [
      { id: "u1", role: "user", text: "Where?" },
      {
        id: "a1",
        role: "assistant",
        text: "At Acme [S1].",
        sources: [SOURCE],
        status: "done",
        steps: [],
        reasoning: "",
        emailDraft: null,
      },
    ],
  });
});

function drafted(n: number, id: string): ChatAction[] {
  return [
    send(`Tell Lwin ${n}`, n),
    event({ type: "meta", conversationId: "c1" }),
    event({ type: "email_draft", draft: { id, text: `Hi Lwin ${n}` } }),
    event({ type: "delta", text: "Check the draft and press Send." }),
    { type: "end", outcome: "complete" },
  ];
}

function draftOf(state: ChatState, entryId: string): AssistantEntry["emailDraft"] {
  const entry = state.entries.find((item) => item.id === entryId);
  return entry?.role === "assistant" ? entry.emailDraft : null;
}

test("an email_draft event puts a pending draft card on the streaming answer", () => {
  const state = run(INITIAL_CHAT_STATE, ...drafted(1, "d1"));
  expect(draftOf(state, "a1")).toEqual({ id: "d1", text: "Hi Lwin 1", state: "pending" });
  expect(pending(state).text).toBe("Check the draft and press Send.");
});

test("a newer draft supersedes older sendable cards and leaves settled ones", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    ...drafted(1, "d1"),
    ...drafted(2, "d2"),
    { type: "draft", entryId: "a2", draftId: "d2", state: "sent" },
    ...drafted(3, "d3"),
    { type: "draft", entryId: "a3", draftId: "d3", state: "failed" },
    ...drafted(4, "d4"),
  );
  expect(draftOf(state, "a1")?.state).toBe("superseded");
  expect(draftOf(state, "a2")?.state).toBe("sent");
  expect(draftOf(state, "a3")?.state).toBe("superseded");
  expect(draftOf(state, "a4")?.state).toBe("pending");
});

test("a draft action changes only the card with that entry and draft id", () => {
  const start = run(INITIAL_CHAT_STATE, ...drafted(1, "d1"));
  const sending = run(start, { type: "draft", entryId: "a1", draftId: "d1", state: "sending" });
  expect(draftOf(sending, "a1")?.state).toBe("sending");
  expect(run(sending, { type: "draft", entryId: "a1", draftId: "other", state: "sent" })).toEqual(sending);
  expect(run(sending, { type: "draft", entryId: "u1", draftId: "d1", state: "sent" })).toEqual(sending);
});

test("draft outcomes map to card states; only pending and failed cards can be sent", () => {
  expect(draftStateFor("sent")).toBe("sent");
  expect(draftStateFor("discarded")).toBe("discarded");
  expect(draftStateFor("limit")).toBe("limit");
  expect(draftStateFor("expired")).toBe("expired");
  expect(draftStateFor("not_found")).toBe("expired");
  expect(draftStateFor("failed")).toBe("failed");
  expect(draftStateFor("unavailable")).toBe("failed");
  expect(EMAIL_DRAFT_STATES.filter(isDraftSendable)).toEqual(["pending", "failed"]);
});

function running(name: ChatStepName, startedAt = 0): ChatAction {
  const step: ChatStep = { name, status: "running", startedAt, durationMs: null, detail: null };
  return event({ type: "step", step });
}

function finished(name: ChatStepName, status: "done" | "failed" = "done", startedAt = 0): ChatStep {
  const detail = status === "done" ? DETAILS[name] ?? null : null;
  return { name, status, startedAt, durationMs: 10, detail };
}

function ended(name: ChatStepName, status: "done" | "failed" = "done", startedAt = 0): ChatAction {
  return event({ type: "step", step: finished(name, status, startedAt) });
}

const DETAILS: Partial<Record<ChatStepName, ChatStepDetail>> = {
  rewrite: { kind: "rewrite", queries: ["Jane employer"], scope: "cv", fallback: false },
  "embed-queries": { kind: "embed", count: 1, dimensions: 8 },
  reasoning: { kind: "reasoning" },
  generate: { kind: "generate", sources: 1 },
};

function pending(state: ChatState): AssistantEntry {
  const last = state.entries.at(-1);
  if (last?.role !== "assistant") throw new Error("no answer entry");
  return last;
}

test("a full turn keeps its steps in start order and its reasoning", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Where?"),
    event({ type: "meta", conversationId: "c1" }),
    running("rewrite"),
    ended("rewrite"),
    running("embed-queries", 10),
    ended("embed-queries", "done", 10),
    running("reasoning", 20),
    event({ type: "reasoning", text: "The CV " }),
    event({ type: "reasoning", text: "says Acme." }),
    ended("reasoning", "done", 20),
    running("generate", 30),
    event({ type: "delta", text: "At Acme [S1]." }),
    ended("generate", "done", 30),
    event({ type: "sources", sources: [SOURCE] }),
    event({ type: "done" }),
    { type: "end", outcome: "complete" },
  );
  expect(pending(state)).toMatchObject({ status: "done", reasoning: "The CV says Acme." });
  expect(pending(state).steps).toEqual([
    finished("rewrite"),
    finished("embed-queries", "done", 10),
    finished("reasoning", "done", 20),
    finished("generate", "done", 30),
  ]);
});

test("a finished step replaces its running one in place", () => {
  const state = run(INITIAL_CHAT_STATE, send("Hi"), running("rewrite"), running("embed-queries"));
  const rewritten = run(state, ended("rewrite"));
  expect(pending(rewritten).steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    "rewrite:done",
    "embed-queries:running",
  ]);
});

test("a late running event never replaces a finished step", () => {
  const state = run(INITIAL_CHAT_STATE, send("Hi"), running("rewrite"), ended("rewrite"));
  expect(run(state, running("rewrite"))).toEqual(state);
  const again = run(state, running("rewrite"), running("rewrite"));
  expect(pending(again).steps).toEqual([finished("rewrite")]);
});

test("a finished step with no running one before it is added", () => {
  const state = run(INITIAL_CHAT_STATE, send("Hi"), ended("rewrite"), ended("generate", "failed"));
  expect(pending(state).steps).toEqual([finished("rewrite"), finished("generate", "failed")]);
});

test("stopping marks running steps stopped and keeps finished ones", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    running("rewrite"),
    ended("rewrite"),
    running("reasoning", 5),
    event({ type: "reasoning", text: "Thinking" }),
    { type: "end", outcome: "stopped" },
  );
  expect(state.notice).toBeNull();
  expect(pending(state)).toMatchObject({ status: "stopped", text: "", reasoning: "Thinking" });
  expect(pending(state).steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    "rewrite:done",
    "reasoning:stopped",
  ]);
  expect(pending(state).steps[1]).toMatchObject({ startedAt: 5, durationMs: null, detail: null });
});

test("an interrupted stream keeps the steps it got, marked stopped", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    running("rewrite"),
    ended("rewrite"),
    running("embed-queries"),
    { type: "end", outcome: "interrupted" },
  );
  expect(state.notice).toBe("interrupted");
  expect(pending(state)).toMatchObject({ status: "interrupted", text: "" });
  expect(pending(state).steps.map((step) => step.status)).toEqual(["done", "stopped"]);
});

test("an error keeps a failed turn with no text, so it shows where it failed", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    running("rewrite"),
    ended("rewrite"),
    running("embed-queries"),
    ended("embed-queries", "failed"),
    event({ type: "error", code: "unavailable" }),
    { type: "end", outcome: "complete" },
  );
  expect(state.streaming).toBe(false);
  expect(state.notice).toBe("unavailable");
  expect(pending(state)).toMatchObject({ status: "interrupted", text: "" });
  expect(pending(state).steps).toEqual([finished("rewrite"), finished("embed-queries", "failed")]);
});

test("an error while a step runs marks that step stopped", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    running("generate"),
    event({ type: "delta", text: "Ja" }),
    event({ type: "error", code: "unavailable" }),
  );
  expect(pending(state).steps.map((step) => step.status)).toEqual(["stopped"]);
});

test("a stream that completes with a step still running marks it stopped", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    running("rewrite"),
    ended("rewrite"),
    running("generate"),
    event({ type: "delta", text: "Hello." }),
    event({ type: "done" }),
  );
  expect(pending(state).status).toBe("done");
  expect(pending(state).steps.map((step) => step.status)).toEqual(["done", "stopped"]);
});

test("steps and reasoning outside a stream are ignored", () => {
  const settled = run(INITIAL_CHAT_STATE, send("Hi"), event({ type: "done" }), {
    type: "end",
    outcome: "complete",
  });
  expect(run(settled, running("rewrite"), event({ type: "reasoning", text: "x" }))).toBe(settled);
});

test("sending is ignored while an answer streams", () => {
  const streaming = run(INITIAL_CHAT_STATE, send("One"));
  expect(run(streaming, send("Two", 2))).toBe(streaming);
});

test("a limit drops the empty answer and shows a notice", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    event({ type: "limit", code: "session_limit" }),
    { type: "end", outcome: "complete" },
  );
  expect(state.streaming).toBe(false);
  expect(state.notice).toBe("session_limit");
  expect(state.entries).toEqual([{ id: "u1", role: "user", text: "Hi" }]);
});

test("an error after some text keeps it and marks it cut off", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    event({ type: "delta", text: "Jane" }),
    event({ type: "error", code: "unavailable" }),
    { type: "end", outcome: "complete" },
  );
  expect(state.notice).toBe("unavailable");
  expect(state.entries.at(-1)).toMatchObject({ text: "Jane", status: "interrupted" });
});

test("a stopped answer is kept, even when empty", () => {
  const state = run(INITIAL_CHAT_STATE, send("Hi"), { type: "end", outcome: "stopped" });
  expect(state.streaming).toBe(false);
  expect(state.notice).toBeNull();
  expect(state.entries.at(-1)).toMatchObject({ text: "", status: "stopped" });
});

test("an interrupted stream shows a notice", () => {
  const state = run(
    INITIAL_CHAT_STATE,
    send("Hi"),
    event({ type: "delta", text: "Ja" }),
    { type: "end", outcome: "interrupted" },
  );
  expect(state.notice).toBe("interrupted");
  expect(state.entries.at(-1)).toMatchObject({ status: "interrupted" });
});

test("a failed request drops the empty answer", () => {
  const state = run(INITIAL_CHAT_STATE, send("Hi"), { type: "fail", notice: "limited" });
  expect(state).toEqual({
    ...INITIAL_CHAT_STATE,
    notice: "limited",
    entries: [{ id: "u1", role: "user", text: "Hi" }],
  });
});

test("a new conversation id from the server drops the older turns", () => {
  const first = run(
    INITIAL_CHAT_STATE,
    send("One"),
    event({ type: "meta", conversationId: "c1" }),
    event({ type: "done" }),
    { type: "end", outcome: "complete" },
  );
  const same = run(first, send("Two", 2), event({ type: "meta", conversationId: "c1" }));
  expect(same.entries).toHaveLength(4);
  const restarted = run(first, send("Two", 2), event({ type: "meta", conversationId: "c2" }));
  expect(restarted.conversationId).toBe("c2");
  expect(restarted.entries.map((entry) => entry.id)).toEqual(["u2", "a2"]);
});

test("events outside a stream are ignored", () => {
  expect(run(INITIAL_CHAT_STATE, event({ type: "delta", text: "x" }))).toBe(INITIAL_CHAT_STATE);
});

test("restore fills only an untouched chat, and reset clears it", () => {
  const entries = [{ id: "u1", role: "user" as const, text: "Hi" }];
  const restored = run(INITIAL_CHAT_STATE, { type: "restore", conversationId: "c1", entries });
  expect(restored).toMatchObject({ conversationId: "c1", entries });
  const again = run(restored, { type: "restore", conversationId: "c9", entries: [] });
  expect(again).toBe(restored);
  expect(run(restored, { type: "reset" })).toEqual(INITIAL_CHAT_STATE);
});
