import type { ChatStreamEnd } from "@/client/api/chat";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_SESSION_MESSAGE_LIMIT,
  type ChatErrorCode,
  type ChatEvent,
  type ChatLimitCode,
  type ChatSource,
} from "@/server/domain/chat";

export type UserEntry = { id: string; role: "user"; text: string };

export type AssistantStatus = "streaming" | "done" | "stopped" | "interrupted";

export type AssistantEntry = {
  id: string;
  role: "assistant";
  text: string;
  // Null until the `sources` event arrives.
  sources: ChatSource[] | null;
  status: AssistantStatus;
};

export type ChatEntry = UserEntry | AssistantEntry;

// What the visitor is told under the conversation. `limited`: the public session or its
// issuance was rate limited. `failed`: the request never got a usable response.
export type ChatNotice = ChatLimitCode | ChatErrorCode | "limited" | "failed" | "interrupted";

export type ChatState = {
  conversationId: string | null;
  entries: ChatEntry[];
  streaming: boolean;
  notice: ChatNotice | null;
};

export type ChatAction =
  | { type: "restore"; conversationId: string | null; entries: ChatEntry[] }
  | { type: "send"; text: string; userId: string; assistantId: string }
  | { type: "event"; event: ChatEvent }
  | { type: "end"; outcome: ChatStreamEnd }
  | { type: "fail"; notice: ChatNotice }
  | { type: "reset" };

export const INITIAL_CHAT_STATE: ChatState = {
  conversationId: null,
  entries: [],
  streaming: false,
  notice: null,
};

export const CHAT_NOTICES: Record<ChatNotice, string> = {
  session_limit: `This visit has reached its limit of ${CHAT_SESSION_MESSAGE_LIMIT} messages. For more, use the contact links at the top of the page.`,
  daily_limit: "The chat has reached its message limit for today. Please try again tomorrow.",
  invalid_message: `Messages must be between 1 and ${CHAT_MESSAGE_MAX_CHARS} characters.`,
  unavailable: "The assistant is unavailable right now. Please try again later.",
  limited: "Too many requests from this browser. Please wait a few minutes and try again.",
  failed: "Your message could not be sent. Check your connection and try again.",
  interrupted: "The answer was cut off. Please try again.",
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "restore":
      // Only into an untouched chat, so a late restore never overwrites a live conversation.
      if (state.streaming || state.entries.length > 0 || state.conversationId !== null) return state;
      return { ...state, conversationId: action.conversationId, entries: action.entries };
    case "send":
      if (state.streaming) return state;
      return {
        ...state,
        streaming: true,
        notice: null,
        entries: [
          ...state.entries,
          { id: action.userId, role: "user", text: action.text },
          { id: action.assistantId, role: "assistant", text: "", sources: null, status: "streaming" },
        ],
      };
    case "event":
      return applyEvent(state, action.event);
    case "end":
      return state.streaming ? endStream({ ...state, streaming: false }, action.outcome) : state;
    case "fail":
      if (!state.streaming) return state;
      return settlePending({ ...state, streaming: false, notice: action.notice });
    case "reset":
      return INITIAL_CHAT_STATE;
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  if (!state.streaming) return state;
  switch (event.type) {
    case "meta":
      // A different id means the server started over (another session, or the old conversation
      // expired), so earlier turns are no longer the answer's history. Keep only this turn.
      return state.conversationId === null || state.conversationId === event.conversationId
        ? { ...state, conversationId: event.conversationId }
        : { ...state, conversationId: event.conversationId, entries: state.entries.slice(-2) };
    case "delta":
      return updatePending(state, (entry) => ({ ...entry, text: entry.text + event.text }));
    case "sources":
      return updatePending(state, (entry) => ({ ...entry, sources: event.sources }));
    case "done":
      return updatePending(state, (entry) => ({ ...entry, status: "done" }));
    case "error":
    case "limit":
      return settlePending({ ...state, notice: event.code });
  }
}

function endStream(state: ChatState, outcome: ChatStreamEnd): ChatState {
  switch (outcome) {
    case "complete":
      return updatePending(state, (entry) => ({ ...entry, status: "done" }));
    case "stopped":
      // Kept even when empty, so the visitor sees the answer was stopped.
      return updatePending(state, (entry) => ({ ...entry, status: "stopped" }));
    case "interrupted":
      return settlePending({ ...state, notice: state.notice ?? "interrupted" });
  }
}

// The answer being streamed, if any: always the last entry.
function updatePending(
  state: ChatState,
  update: (entry: AssistantEntry) => AssistantEntry,
): ChatState {
  const last = state.entries.at(-1);
  if (!last || last.role !== "assistant" || last.status !== "streaming") return state;
  return { ...state, entries: [...state.entries.slice(0, -1), update(last)] };
}

// Ends an answer that will get no more text: dropped when it has none, marked cut off otherwise.
function settlePending(state: ChatState): ChatState {
  const last = state.entries.at(-1);
  if (!last || last.role !== "assistant" || last.status !== "streaming") return state;
  if (!last.text) return { ...state, entries: state.entries.slice(0, -1) };
  return updatePending(state, (entry) => ({ ...entry, status: "interrupted" }));
}
