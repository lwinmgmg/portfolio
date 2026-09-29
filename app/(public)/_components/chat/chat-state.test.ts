import { expect, test } from "bun:test";

import {
  chatReducer,
  INITIAL_CHAT_STATE,
  type ChatAction,
  type ChatState,
} from "@/app/(public)/_components/chat/chat-state";
import type { ChatEvent, ChatSource } from "@/server/domain/chat";

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
      { id: "a1", role: "assistant", text: "At Acme [S1].", sources: [SOURCE], status: "done" },
    ],
  });
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
