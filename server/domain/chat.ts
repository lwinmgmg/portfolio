import type { QueryScope } from "@/server/domain/rag";

// One message of a visitor conversation, without sources or metadata.
export type ChatTurn = { role: "user" | "assistant"; text: string };

// Longest visitor message, in UTF-16 code units (what a textarea `maxLength` counts).
export const CHAT_MESSAGE_MAX_CHARS = 500;

// User messages one public session may send.
export const CHAT_SESSION_MESSAGE_LIMIT = 20;

// Conversations are removed this long after their last message.
export const CHAT_CONVERSATION_TTL_SECONDS = 30 * 24 * 3600;

// The visitor's thumb on an answer.
export type ChatFeedback = "up" | "down";

// Only the text is stored. Retrieved chunks never enter the history.
export type StoredMessage = ChatTurn & {
  // CV entities the answer cited. Empty for user messages.
  citedEntityKeys: string[];
  // The retrieval trace behind an answer. Null for user messages.
  traceId: string | null;
  // Set by the visitor on an assistant message; null until then, and always for user messages.
  feedback: ChatFeedback | null;
  createdAt: string;
};

// ---- Email drafts: the send_email tool drafts, and only the visitor's Send click sends ----

// Longest draft text, in UTF-16 code units.
export const EMAIL_DRAFT_MAX_CHARS = 2_000;

// A pending draft older than this can no longer be sent.
export const EMAIL_DRAFT_TTL_MS = 3_600_000;

// A draft still `sending` this long after its claim reads as `failed`: the function that claimed
// it died mid-send. It is never resent, since Gmail may have taken the message.
export const EMAIL_SEND_STUCK_MS = 120_000;

export type EmailDraftStatus = "pending" | "sending" | "sent" | "failed" | "discarded" | "superseded";

export type EmailDraft = {
  id: string;
  text: string;
  status: EmailDraftStatus;
  createdAt: string;
  sentAt: string | null;
};

export type Conversation = {
  id: string;
  // The public session that owns the conversation.
  sessionId: string;
  messages: StoredMessage[];
  // Oldest first. Kept out of `messages`, so the history stays text only.
  emailDrafts: EmailDraft[];
  createdAt: string;
  updatedAt: string;
};

export interface ConversationRepository {
  ensureReady(): Promise<void>;
  // Null when the conversation is missing or belongs to another session.
  findForSession(id: string, sessionId: string): Promise<Conversation | null>;
  create(sessionId: string): Promise<Conversation>;
  append(id: string, messages: StoredMessage[]): Promise<void>;
  // Adds the draft and marks the conversation's older pending drafts `superseded`, in one write.
  addEmailDraft(conversationId: string, draft: EmailDraft): Promise<void>;
  countUserMessagesForSession(sessionId: string): Promise<number>;
  countUserMessagesSince(since: Date): Promise<number>;
}

// The Send side of email drafts. The conversation repository implements it too; it is its own
// interface so the chat turn's fakes need not grow.
export interface EmailDraftStore {
  // `pending` -> `sending` in one atomic update. Only the session's conversation, only its newest
  // draft, and only one younger than EMAIL_DRAFT_TTL_MS. Null when nothing matched.
  claimEmailDraft(
    conversationId: string,
    sessionId: string,
    draftId: string,
    now: Date,
  ): Promise<EmailDraft | null>;
  // `sending` -> `sent` (with `sentAt: at`) or `failed`.
  markEmailDraft(
    conversationId: string,
    draftId: string,
    status: "sent" | "failed",
    at: Date,
  ): Promise<void>;
  // `pending` -> `discarded`, for the session's own conversation. False when nothing matched.
  discardEmailDraft(conversationId: string, sessionId: string, draftId: string): Promise<boolean>;
  // Drafts `sent` or still `sending` (a send in flight holds its place in the limit).
  countSentEmailsForSession(sessionId: string): Promise<number>;
  // The same, claimed at or after `since`.
  countSentEmailsSince(since: Date): Promise<number>;
  // Writes `failed` on drafts claimed before `claimedBefore` and still `sending`.
  failEmailDraftsStuckSince(claimedBefore: Date): Promise<void>;
  findForSession(id: string, sessionId: string): Promise<Conversation | null>;
}

// The feedback side of the conversation store. Its own interface, like EmailDraftStore, so the
// chat turn's fakes need not grow.
export interface MessageFeedbackStore {
  // Sets (or replaces) the thumb on an assistant message of the session's own conversation.
  // False when the conversation, the message or the session's ownership does not match.
  setFeedback(
    conversationId: string,
    sessionId: string,
    messageIndex: number,
    value: ChatFeedback,
  ): Promise<boolean>;
  // The feedback on the answers behind these traces. Traces without feedback are left out.
  feedbackByTraceId(traceIds: readonly string[]): Promise<Map<string, ChatFeedback>>;
  // Traces whose answer got this feedback, newest conversation activity first.
  traceIdsWithFeedback(value: ChatFeedback, limit: number): Promise<string[]>;
}

// A source an answer cited, linked to its place on the CV page.
export type ChatSource = {
  sourceId: string;
  entityKeys: string[];
  title: string;
  section: string;
  // `#experience-acme`, or null when the first entity key has no anchor.
  anchor: string | null;
};

// ---- Steps: the work behind an answer, shown to the visitor as it happens ----

// Most hits a step lists per result list. The list's `total` keeps the full count.
export const CHAT_STEP_HITS = 10;

// Longest reasoning text kept after the turn (in the trace, and later in the browser transcript).
export const CHAT_REASONING_MAX_CHARS = 8_000;

// What one tool call came to. `invalid`: the arguments did not parse. `ignored`: a call after
// the turn's first. `failed`: the tool threw.
export type ToolCallOutcome = "drafted" | "invalid" | "unknown_tool" | "ignored" | "failed";

// The stage names (STAGE in trace-stages.ts), plus the answer model's reasoning.
export type ChatStepName =
  | "route"
  | "rewrite"
  | "embed-queries"
  | "vector-search"
  | "lexical-search"
  | "fuse"
  | "rerank"
  | "filter"
  | "reasoning"
  | "generate"
  | "tool";

export type ChatStepStatus = "running" | "done" | "failed";

// A search result without its chunk text. `anchor` is as in ChatSource.
export type ChatStepHit = {
  rank: number;
  score: number;
  title: string;
  section: string;
  anchor: string | null;
};

export type ChatStepDetail =
  // `scope`: the short-circuit, or null when the rewriter decides. `fallback`: the router failed.
  | { kind: "route"; scope: QueryScope | null; fallback: boolean }
  // `fallback`: the rewriter failed and the message was searched as written.
  | { kind: "rewrite"; queries: string[]; scope: QueryScope; fallback: boolean }
  | { kind: "embed"; count: number; dimensions: number }
  | {
      kind: "search";
      method: "vector" | "bm25";
      lists: { query: string; total: number; hits: ChatStepHit[] }[];
    }
  | {
      kind: "fuse";
      // Chunks fused, before the cut to the fused limit.
      total: number;
      hits: (ChatStepHit & { contributions: { list: string; rank: number }[] })[];
    }
  // `fallback`: the reranker failed and the fused order was kept.
  | { kind: "rerank"; fallback: boolean; hits: (ChatStepHit & { fusedRank: number })[] }
  | { kind: "filter"; minScore: number; kept: number; dropped: ChatStepHit[] }
  | { kind: "reasoning" }
  | { kind: "generate"; sources: number }
  // Never the arguments: a draft's text reaches only its own session, in `email_draft`.
  | { kind: "tool"; name: string; outcome: ToolCallOutcome };

export type ChatStep = {
  name: ChatStepName;
  status: ChatStepStatus;
  // Milliseconds from the start of the turn.
  startedAt: number;
  // Null while running.
  durationMs: number | null;
  // Null while running, when the step failed, or when its result could not be read.
  detail: ChatStepDetail | null;
};

export type ChatLimitCode = "session_limit" | "daily_limit";

export type ChatErrorCode = "invalid_message" | "unavailable";

// What the chat API streams, one JSON object per line.
export type ChatEvent =
  | { type: "meta"; conversationId: string }
  // A step started (`running`) or ended. The ended one replaces the running one of that name.
  | { type: "step"; step: ChatStep }
  // The answer model's reasoning, streamed before the answer.
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  // The send_email tool drafted this; it is sent only when the visitor presses Send.
  | { type: "email_draft"; draft: { id: string; text: string } }
  | { type: "sources"; sources: ChatSource[] }
  // `messageIndex`: where the answer sits in the stored conversation, the address of its
  // feedback. Null when the turn was not stored.
  | { type: "done"; messageIndex: number | null }
  | { type: "error"; code: ChatErrorCode }
  | { type: "limit"; code: ChatLimitCode };
