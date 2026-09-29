import { expect, test } from "bun:test";

import type {
  AssistantEntry,
  ChatEntry,
  UserEntry,
} from "@/app/(public)/_components/chat/chat-state";
import {
  CONVERSATION_ID_KEY,
  MESSAGES_KEY,
  readStoredChat,
  writeStoredChat,
} from "@/app/(public)/_components/chat/chat-storage";

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const QUESTION: UserEntry = { id: "u1", role: "user", text: "Where?" };

const ANSWER: AssistantEntry = {
  id: "a1",
  role: "assistant",
  text: "At Acme [S1].",
  sources: [
    {
      sourceId: "S1",
      entityKeys: ["experience:acme"],
      title: "Engineer",
      section: "experience",
      anchor: "#experience-acme",
    },
  ],
  status: "done",
  steps: [
    {
      name: "rewrite",
      status: "done",
      startedAt: 0,
      durationMs: 800,
      detail: { kind: "rewrite", queries: ["Jane employer"], scope: "cv", fallback: false },
    },
    { name: "rerank", status: "failed", startedAt: 800, durationMs: 20, detail: null },
  ],
  reasoning: "The CV says Acme.",
};

// Stopped while reasoning: no text, and the running step marked stopped.
const STOPPED: AssistantEntry = {
  id: "a2",
  role: "assistant",
  text: "",
  sources: null,
  status: "stopped",
  steps: [{ name: "reasoning", status: "stopped", startedAt: 5, durationMs: null, detail: null }],
  reasoning: "Looking",
};

const ENTRIES: ChatEntry[] = [
  QUESTION,
  ANSWER,
  { id: "u2", role: "user", text: "And before?" },
  STOPPED,
];

function storedAnswer(storage: MemoryStorage): unknown {
  const stored: unknown = JSON.parse(storage.getItem(MESSAGES_KEY) ?? "[]");
  return Array.isArray(stored) ? stored[1] : undefined;
}

// Stores QUESTION and ANSWER, with `fields` replacing (or, when undefined, removing) the answer's.
function storedWith(storage: MemoryStorage, fields: Record<string, unknown>): void {
  storage.setItem(CONVERSATION_ID_KEY, "c1");
  storage.setItem(MESSAGES_KEY, JSON.stringify([QUESTION, { ...ANSWER, ...fields }]));
}

test("round-trips a conversation and clears it", () => {
  const storage = new MemoryStorage();
  writeStoredChat(storage, { conversationId: "c1", entries: ENTRIES });
  expect(storage.getItem(CONVERSATION_ID_KEY)).toBe("c1");
  expect(readStoredChat(storage)).toEqual({ conversationId: "c1", entries: ENTRIES });

  writeStoredChat(storage, { conversationId: null, entries: [] });
  expect(storage.items.size).toBe(0);
  expect(readStoredChat(storage)).toEqual({ conversationId: null, entries: [] });
});

test("keeps the conversation id but drops a malformed transcript", () => {
  const storage = new MemoryStorage();
  storage.setItem(CONVERSATION_ID_KEY, "c1");
  for (const raw of ["not json", '{"a":1}', '[{"id":"a1","role":"assistant","text":"x","sources":null,"status":"streaming"}]']) {
    storage.setItem(MESSAGES_KEY, raw);
    expect(readStoredChat(storage)).toEqual({ conversationId: "c1", entries: [] });
  }
  for (const fields of [{ steps: "rewrite" }, { reasoning: 42 }]) {
    storedWith(storage, fields);
    expect(readStoredChat(storage)).toEqual({ conversationId: "c1", entries: [] });
  }
});

test("caps stored reasoning at 8,000 characters", () => {
  const storage = new MemoryStorage();
  const long: AssistantEntry = { ...ANSWER, reasoning: "r".repeat(9_000) };
  writeStoredChat(storage, { conversationId: "c1", entries: [QUESTION, long] });
  expect(storedAnswer(storage)).toMatchObject({ reasoning: "r".repeat(8_000) });
  expect(readStoredChat(storage).entries).toEqual([
    QUESTION,
    { ...long, reasoning: "r".repeat(8_000) },
  ]);

  // A longer value written by anything else is cut on read too.
  storedWith(storage, { reasoning: "r".repeat(8_001) });
  expect(readStoredChat(storage).entries[1]).toMatchObject({ reasoning: "r".repeat(8_000) });
});

test("an entry stored before steps existed loads with none", () => {
  const storage = new MemoryStorage();
  storedWith(storage, { steps: undefined, reasoning: undefined });
  expect(storedAnswer(storage)).not.toHaveProperty("steps");
  expect(readStoredChat(storage).entries).toEqual([
    QUESTION,
    { ...ANSWER, steps: [], reasoning: "" },
  ]);
});

test("a stored step this client cannot read is skipped, and a bad detail is dropped", () => {
  const storage = new MemoryStorage();
  const kept = { name: "rewrite", status: "done", startedAt: 0, durationMs: 1, detail: null };
  const badAnchor = {
    name: "filter",
    status: "done",
    startedAt: 1,
    durationMs: 1,
    detail: {
      kind: "filter",
      minScore: 0.2,
      kept: 1,
      dropped: [{ rank: 1, score: 0.1, title: "x", section: "s", anchor: "javascript:x" }],
    },
  };
  storedWith(storage, {
    steps: [kept, { ...kept, name: "plan" }, { ...kept, status: "queued" }, badAnchor],
  });
  expect(readStoredChat(storage).entries[1]).toMatchObject({
    steps: [kept, { ...badAnchor, detail: null }],
  });
});

test("works without storage, or when it throws", () => {
  expect(readStoredChat(null)).toEqual({ conversationId: null, entries: [] });
  const throwing = {
    getItem(): string | null {
      throw new Error("blocked");
    },
    setItem(): void {
      throw new Error("quota");
    },
    removeItem(): void {
      throw new Error("blocked");
    },
  };
  expect(readStoredChat(throwing)).toEqual({ conversationId: null, entries: [] });
  writeStoredChat(throwing, { conversationId: "c1", entries: ENTRIES });
  writeStoredChat(null, { conversationId: "c1", entries: ENTRIES });
});
