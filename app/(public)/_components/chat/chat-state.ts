import type { ChatStreamEnd } from "@/client/api/chat";
import { CHAT_STEP_STATUSES } from "@/client/api/chat-steps";
import type { ContactEmailOutcome } from "@/client/api/contact-email";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_SESSION_MESSAGE_LIMIT,
  type ChatErrorCode,
  type ChatEvent,
  type ChatLimitCode,
  type ChatSource,
  type ChatStep,
  type ChatStepStatus,
} from "@/server/domain/chat";

export type UserEntry = { id: string; role: "user"; text: string };

export type AssistantStatus = "streaming" | "done" | "stopped" | "interrupted";

// `stopped`: the step was still running when its answer ended. Only the client sets it.
export type AnswerStepStatus = ChatStepStatus | "stopped";

export const ANSWER_STEP_STATUSES: readonly AnswerStepStatus[] = [
  ...CHAT_STEP_STATUSES,
  "stopped",
];

export type AnswerStep = Omit<ChatStep, "status"> & { status: AnswerStepStatus };

// What the draft card shows. `expired` also covers a draft the server no longer has (404);
// `failed` covers a refused send and a request that never got an answer.
export type EmailDraftState =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "expired"
  | "discarded"
  | "superseded"
  | "limit";

export const EMAIL_DRAFT_STATES: readonly EmailDraftState[] = [
  "pending",
  "sending",
  "sent",
  "failed",
  "expired",
  "discarded",
  "superseded",
  "limit",
];

export type EmailDraftCard = { id: string; text: string; state: EmailDraftState };

// Only these can still be sent. The server claims a draft once, so a second Send after a
// `failed` that did reach Gmail is refused there, never sent twice.
export function isDraftSendable(state: EmailDraftState): boolean {
  return state === "pending" || state === "failed";
}

export function draftStateFor(outcome: ContactEmailOutcome): EmailDraftState {
  switch (outcome) {
    case "sent":
    case "discarded":
    case "limit":
    case "expired":
    case "failed":
      return outcome;
    case "not_found":
      return "expired";
    case "unavailable":
      return "failed";
  }
}

export type AssistantEntry = {
  id: string;
  role: "assistant";
  text: string;
  // Null until the `sources` event arrives.
  sources: ChatSource[] | null;
  status: AssistantStatus;
  // The work behind the answer, one per step name, in the order the steps started.
  steps: AnswerStep[];
  // The answer model's reasoning, streamed before the text.
  reasoning: string;
  // The email the answer drafted, shown as a card with Send and Discard.
  emailDraft: EmailDraftCard | null;
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
  | { type: "draft"; entryId: string; draftId: string; state: EmailDraftState }
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
          {
            id: action.assistantId,
            role: "assistant",
            text: "",
            sources: null,
            status: "streaming",
            steps: [],
            reasoning: "",
            emailDraft: null,
          },
        ],
      };
    case "event":
      return applyEvent(state, action.event);
    case "draft":
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.role === "assistant" && entry.id === action.entryId && entry.emailDraft?.id === action.draftId
            ? { ...entry, emailDraft: { ...entry.emailDraft, state: action.state } }
            : entry,
        ),
      };
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
    case "step":
      return updatePending(state, (entry) => ({
        ...entry,
        steps: upsertStep(entry.steps, event.step),
      }));
    case "reasoning":
      return updatePending(state, (entry) => ({
        ...entry,
        reasoning: entry.reasoning + event.text,
      }));
    case "delta":
      return updatePending(state, (entry) => ({ ...entry, text: entry.text + event.text }));
    case "sources":
      return updatePending(state, (entry) => ({ ...entry, sources: event.sources }));
    case "email_draft":
      return updatePending(supersedeDrafts(state), (entry) => ({
        ...entry,
        emailDraft: { id: event.draft.id, text: event.draft.text, state: "pending" },
      }));
    case "done":
      return updatePending(state, (entry) => settle(entry, "done"));
    case "error":
    case "limit":
      return settlePending({ ...state, notice: event.code });
  }
}

function endStream(state: ChatState, outcome: ChatStreamEnd): ChatState {
  switch (outcome) {
    case "complete":
      return updatePending(state, (entry) => settle(entry, "done"));
    case "stopped":
      // Kept even when empty, so the visitor sees the answer was stopped.
      return updatePending(state, (entry) => settle(entry, "stopped"));
    case "interrupted":
      return settlePending({ ...state, notice: state.notice ?? "interrupted" });
  }
}

// The server supersedes every older pending draft when it stores a new one, so older cards that
// could still be sent say they were replaced.
function supersedeDrafts(state: ChatState): ChatState {
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.role === "assistant" && entry.emailDraft && isDraftSendable(entry.emailDraft.state)
        ? { ...entry, emailDraft: { ...entry.emailDraft, state: "superseded" } }
        : entry,
    ),
  };
}

// Adds a step, or replaces the one of its name. A running event never replaces a step that
// is already known, so a late `running` cannot undo a finished step.
function upsertStep(steps: AnswerStep[], step: ChatStep): AnswerStep[] {
  const index = steps.findIndex((known) => known.name === step.name);
  if (index === -1) return [...steps, step];
  if (step.status === "running") return steps;
  return steps.map((known, i) => (i === index ? step : known));
}

// Ends an answer. The server sends no end for a step that was running when the stream
// stopped, so the client marks it stopped.
function settle(
  entry: AssistantEntry,
  status: Exclude<AssistantStatus, "streaming">,
): AssistantEntry {
  const steps = entry.steps.map((step): AnswerStep =>
    step.status === "running" ? { ...step, status: "stopped" } : step,
  );
  return { ...entry, status, steps };
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

// Ends an answer that will get no more text: dropped when it has neither text nor steps,
// marked cut off otherwise, so a failed turn still shows the step it failed at.
function settlePending(state: ChatState): ChatState {
  const last = state.entries.at(-1);
  if (!last || last.role !== "assistant" || last.status !== "streaming") return state;
  if (!last.text && last.steps.length === 0) {
    return { ...state, entries: state.entries.slice(0, -1) };
  }
  return updatePending(state, (entry) => settle(entry, "interrupted"));
}
