import { expect, test } from "bun:test";

import type { ChatEntry } from "@/app/(public)/_components/chat/chat-state";
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

const ENTRIES: ChatEntry[] = [
  { id: "u1", role: "user", text: "Where?" },
  {
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
  },
];

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
