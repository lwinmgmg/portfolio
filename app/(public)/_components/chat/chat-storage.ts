import { isChatSource } from "@/client/api/chat";
import { isRecord, readChatStep } from "@/client/api/chat-steps";
import {
  ANSWER_STEP_STATUSES,
  EMAIL_DRAFT_STATES,
  type AssistantStatus,
  type ChatEntry,
  type EmailDraftCard,
} from "@/app/(public)/_components/chat/chat-state";
import {
  isRemarkSection,
  type RemarkSection,
} from "@/app/(public)/_components/robot/robot-remarks";
import { CHAT_REASONING_MAX_CHARS } from "@/server/domain/chat";

// Per tab, so a reload continues the conversation and a new tab starts fresh.
export const CONVERSATION_ID_KEY = "cv-chat:conversationId";
// The transcript, so a reload shows the turns the server still has as history.
export const MESSAGES_KEY = "cv-chat:messages";
// Set when the robot's greeting appears, so it greets once per tab.
export const GREETED_KEY = "cv-chat:greeted";
// The sections the robot has remarked on, so it says each line once per tab.
export const REMARKED_KEY = "cv-chat:remarked";

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
  const stored = guarded((): unknown => JSON.parse(storage?.getItem(MESSAGES_KEY) ?? "[]"), []);
  const entries = Array.isArray(stored) ? stored.map(readStoredEntry) : [];
  return {
    conversationId,
    entries: entries.every((entry) => entry !== null) ? entries : [],
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
    storage.setItem(MESSAGES_KEY, JSON.stringify(chat.entries.map(capReasoning)));
  } catch {
    // Quota or blocked storage: the conversation still works for this page view.
  }
}

// Without readable storage the tab counts as not greeted, so the robot greets on each page load.
export function readGreeted(storage: ReadableStorage | null): boolean {
  return guarded(() => storage?.getItem(GREETED_KEY) === "1", false);
}

export function writeGreeted(storage: WritableStorage | null): void {
  try {
    storage?.setItem(GREETED_KEY, "1");
  } catch {
    // Blocked storage: a reload greets again.
  }
}

// The sections the robot has already remarked on in this tab. Unknown values are dropped.
export function readRemarked(storage: ReadableStorage | null): RemarkSection[] {
  const stored = guarded((): unknown => JSON.parse(storage?.getItem(REMARKED_KEY) ?? "[]"), []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (value): value is RemarkSection => typeof value === "string" && isRemarkSection(value),
  );
}

export function writeRemarked(
  storage: (ReadableStorage & WritableStorage) | null,
  section: RemarkSection,
): void {
  const remarked = readRemarked(storage);
  if (remarked.includes(section)) return;
  try {
    storage?.setItem(REMARKED_KEY, JSON.stringify([...remarked, section]));
  } catch {
    // Blocked storage: a reload may remark on the section again.
  }
}

function capReasoning(entry: ChatEntry): ChatEntry {
  if (entry.role === "user" || entry.reasoning.length <= CHAT_REASONING_MAX_CHARS) return entry;
  return { ...entry, reasoning: entry.reasoning.slice(0, CHAT_REASONING_MAX_CHARS) };
}

// Null for an entry that cannot be shown. Entries stored before steps existed have no `steps`
// or `reasoning` and load with none; a step this client cannot read is skipped.
function readStoredEntry(value: unknown): ChatEntry | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") {
    return null;
  }
  if (value.role === "user") return { id: value.id, role: "user", text: value.text };
  const status = SETTLED.find((settled) => settled === value.status);
  const sources = value.sources;
  if (value.role !== "assistant" || status === undefined) return null;
  if (sources !== null && !(Array.isArray(sources) && sources.every(isChatSource))) return null;
  const steps = value.steps ?? [];
  const reasoning = value.reasoning ?? "";
  if (!Array.isArray(steps) || typeof reasoning !== "string") return null;
  return {
    id: value.id,
    role: "assistant",
    text: value.text,
    sources,
    status,
    steps: steps.flatMap((step) => readChatStep(step, ANSWER_STEP_STATUSES) ?? []),
    reasoning: reasoning.slice(0, CHAT_REASONING_MAX_CHARS),
    emailDraft: readStoredDraft(value.emailDraft),
  };
}

// Null for a missing (stored before drafts existed) or unreadable draft; the answer still shows.
// A draft saved mid-send comes back sendable: the server decides whether it went out.
function readStoredDraft(value: unknown): EmailDraftCard | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") {
    return null;
  }
  const state = EMAIL_DRAFT_STATES.find((known) => known === value.state);
  if (state === undefined) return null;
  return { id: value.id, text: value.text, state: state === "sending" ? "pending" : state };
}
