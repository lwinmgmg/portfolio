"use client";

import { isCvAnchor, isRecord, parseChatStep } from "@/client/api/chat-steps";
import { readNdjson } from "@/client/api/ndjson";
import { errorKindFor, postPublicStream, PublicApiError } from "@/client/api/public-http";
import type {
  ChatErrorCode,
  ChatEvent,
  ChatLimitCode,
  ChatSource,
} from "@/server/domain/chat";

const CHAT_PATH = "/api/public/chat";

export type ChatRequest = { conversationId: string | null; message: string };

// How a stream that got a response ended:
// `complete`: a final event (done, error or limit) arrived.
// `stopped`: the caller aborted it.
// `interrupted`: the body ended or failed before a final event.
export type ChatStreamEnd = "complete" | "stopped" | "interrupted";

const ERROR_CODES: readonly ChatErrorCode[] = ["invalid_message", "unavailable"];
const LIMIT_CODES: readonly ChatLimitCode[] = ["session_limit", "daily_limit"];

// Sends one message and reports each streamed event. Throws PublicApiError when the request is
// refused (429 `limited`, 503 `unavailable`), and the fetch's own error when it never reached us.
// Aborting `signal` cancels the body; the server stores what it had generated as stopped.
export async function streamChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  options: { signal?: AbortSignal } = {},
): Promise<ChatStreamEnd> {
  const { signal } = options;
  const response = await postPublicStream(CHAT_PATH, JSON.stringify(request));
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    const kind = response.ok ? "invalid_response" : errorKindFor(response.status);
    throw new PublicApiError(kind, response.status);
  }

  let final = false;
  try {
    for await (const value of readNdjson(response.body, signal)) {
      const event = parseChatEvent(value);
      if (!event) continue;
      if (event.type === "done" || event.type === "error" || event.type === "limit") final = true;
      onEvent(event);
    }
  } catch {
    // The connection dropped mid-answer; reported below as interrupted (or stopped).
  }
  if (final) return "complete";
  return signal?.aborted ? "stopped" : "interrupted";
}

// Null for anything that is not a known event, so a newer server can add event types.
export function parseChatEvent(value: unknown): ChatEvent | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "meta":
      return typeof value.conversationId === "string"
        ? { type: "meta", conversationId: value.conversationId }
        : null;
    case "step": {
      const step = parseChatStep(value.step);
      return step ? { type: "step", step } : null;
    }
    case "reasoning":
      return typeof value.text === "string" ? { type: "reasoning", text: value.text } : null;
    case "delta":
      return typeof value.text === "string" ? { type: "delta", text: value.text } : null;
    case "sources":
      return Array.isArray(value.sources) && value.sources.every(isChatSource)
        ? { type: "sources", sources: value.sources }
        : null;
    case "done":
      return { type: "done" };
    case "error": {
      const code = ERROR_CODES.find((known) => known === value.code);
      return code ? { type: "error", code } : null;
    }
    case "limit": {
      const code = LIMIT_CODES.find((known) => known === value.code);
      return code ? { type: "limit", code } : null;
    }
    default:
      return null;
  }
}

export function isChatSource(value: unknown): value is ChatSource {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    Array.isArray(value.entityKeys) &&
    value.entityKeys.every((key) => typeof key === "string") &&
    typeof value.title === "string" &&
    typeof value.section === "string" &&
    (value.anchor === null || isCvAnchor(value.anchor))
  );
}
