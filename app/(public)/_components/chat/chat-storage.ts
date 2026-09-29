import { isChatSource } from "@/client/api/chat";
import type {
  AssistantStatus,
  ChatEntry,
} from "@/app/(public)/_components/chat/chat-state";

// Per tab, so a reload continues the conversation and a new tab starts fresh.
export const CONVERSATION_ID_KEY = "cv-chat:conversationId";
// The transcript, so a reload shows the turns the server still has as history.
export const MESSAGES_KEY = "cv-chat:messages";

export type StoredChat = { conversationId: string | null; entries: ChatEntry[] };

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

const SETTLED: readonly AssistantStatus[] = ["done", "stopped", "interrupted"];

// Storage can be missing or throw (private mode, blocked site data), so every access is guarded
// and the chat works without it.
export function browserSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStoredChat(storage: ReadableStorage | null): StoredChat {
  const conversationId = guarded(() => storage?.getItem(CONVERSATION_ID_KEY) || null, null);
  if (!conversationId) return { conversationId: null, entries: [] };
  const entries = guarded((): unknown => JSON.parse(storage?.getItem(MESSAGES_KEY) ?? "[]"), []);
  return {
    conversationId,
    entries: Array.isArray(entries) && entries.every(isStoredEntry) ? entries : [],
  };
}

function guarded<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

// Only a settled chat is written; a cleared one removes both keys.
export function writeStoredChat(storage: WritableStorage | null, chat: StoredChat): void {
  if (!storage) return;
  try {
    if (chat.conversationId === null) {
      storage.removeItem(CONVERSATION_ID_KEY);
      storage.removeItem(MESSAGES_KEY);
      return;
    }
    storage.setItem(CONVERSATION_ID_KEY, chat.conversationId);
    storage.setItem(MESSAGES_KEY, JSON.stringify(chat.entries));
  } catch {
    // Quota or blocked storage: the conversation still works for this page view.
  }
}

function isStoredEntry(value: unknown): value is ChatEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || typeof entry.text !== "string") return false;
  if (entry.role === "user") return true;
  return (
    entry.role === "assistant" &&
    SETTLED.some((status) => status === entry.status) &&
    (entry.sources === null || (Array.isArray(entry.sources) && entry.sources.every(isChatSource)))
  );
}
