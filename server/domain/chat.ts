// One message of a visitor conversation, without sources or metadata.
export type ChatTurn = { role: "user" | "assistant"; text: string };

// Longest visitor message, in UTF-16 code units (what a textarea `maxLength` counts).
export const CHAT_MESSAGE_MAX_CHARS = 500;

// User messages one public session may send.
export const CHAT_SESSION_MESSAGE_LIMIT = 20;

// Conversations are removed this long after their last message.
export const CHAT_CONVERSATION_TTL_SECONDS = 30 * 24 * 3600;

// Only the text is stored. Retrieved chunks never enter the history.
export type StoredMessage = ChatTurn & {
  // CV entities the answer cited. Empty for user messages.
  citedEntityKeys: string[];
  // The retrieval trace behind an answer. Null for user messages.
  traceId: string | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  // The public session that owns the conversation.
  sessionId: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
};

export interface ConversationRepository {
  ensureReady(): Promise<void>;
  // Null when the conversation is missing or belongs to another session.
  findForSession(id: string, sessionId: string): Promise<Conversation | null>;
  create(sessionId: string): Promise<Conversation>;
  append(id: string, messages: StoredMessage[]): Promise<void>;
  countUserMessagesForSession(sessionId: string): Promise<number>;
  countUserMessagesSince(since: Date): Promise<number>;
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

export type ChatLimitCode = "session_limit" | "daily_limit";

export type ChatErrorCode = "invalid_message" | "unavailable";

// What the chat API streams, one JSON object per line.
export type ChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "done" }
  | { type: "error"; code: ChatErrorCode }
  | { type: "limit"; code: ChatLimitCode };
