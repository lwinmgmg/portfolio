"use client";

import { useEffect, useReducer, useRef } from "react";

import { streamChat } from "@/client/api/chat";
import { sendChatFeedback } from "@/client/api/chat-feedback";
import { sendContactEmail } from "@/client/api/contact-email";
import { PublicApiError } from "@/client/api/public-http";
import {
  chatReducer,
  draftStateFor,
  INITIAL_CHAT_STATE,
  isDraftSendable,
  type ChatNotice,
} from "@/app/(public)/_components/chat/chat-state";
import {
  browserSessionStorage,
  readStoredChat,
  writeStoredChat,
} from "@/app/(public)/_components/chat/chat-storage";
import { CHAT_MESSAGE_MAX_CHARS, type ChatFeedback } from "@/server/domain/chat";

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const controller = useRef<AbortController | null>(null);
  // Storage is read on first open, not during render, so the server HTML and hydration match.
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current && !state.streaming) {
      writeStoredChat(browserSessionStorage(), state);
    }
  }, [state]);

  // Leaving the page stops the answer; the server stores it as stopped.
  useEffect(() => () => controller.current?.abort(), []);

  function restore() {
    if (restored.current) return;
    restored.current = true;
    dispatch({ type: "restore", ...readStoredChat(browserSessionStorage()) });
  }

  async function send(text: string) {
    const message = text.trim();
    if (state.streaming || !message || message.length > CHAT_MESSAGE_MAX_CHARS) return;
    const current = new AbortController();
    controller.current = current;
    dispatch({ type: "send", text: message, userId: entryId(), assistantId: entryId() });
    try {
      const outcome = await streamChat(
        { conversationId: state.conversationId, message },
        (event) => dispatch({ type: "event", event }),
        { signal: current.signal },
      );
      dispatch({ type: "end", outcome });
    } catch (error) {
      dispatch({ type: "fail", notice: noticeFor(error) });
    } finally {
      if (controller.current === current) controller.current = null;
    }
  }

  function stop() {
    controller.current?.abort();
  }

  // Send or Discard on an answer's draft card. The server claims a draft once, so a repeated
  // Send can never mail it twice.
  async function actOnDraft(entryId: string, action: "send" | "discard") {
    const { conversationId } = state;
    const entry = state.entries.find((item) => item.id === entryId);
    const draft = entry?.role === "assistant" ? entry.emailDraft : null;
    if (!conversationId || !draft || !isDraftSendable(draft.state)) return;
    const request = { conversationId, draftId: draft.id, action };
    if (action === "discard") {
      // Nothing the server answers changes the card; a draft left pending expires in an hour.
      dispatch({ type: "draft", entryId, draftId: draft.id, state: "discarded" });
      void sendContactEmail(request);
      return;
    }
    dispatch({ type: "draft", entryId, draftId: draft.id, state: "sending" });
    const outcome = await sendContactEmail(request);
    dispatch({ type: "draft", entryId, draftId: draft.id, state: draftStateFor(outcome) });
  }

  // The thumb shows only once the server has stored it, so it never claims more than the admin
  // will see. A refused or failed request leaves the buttons as they were.
  async function rateAnswer(entryId: string, value: ChatFeedback) {
    const { conversationId } = state;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!conversationId || entry?.role !== "assistant" || entry.messageIndex === null) return;
    if (entry.feedback === value) return;
    if (await sendChatFeedback({ conversationId, messageIndex: entry.messageIndex, value })) {
      dispatch({ type: "feedback", entryId, value });
    }
  }

  function reset() {
    if (state.streaming) return;
    restored.current = true;
    dispatch({ type: "reset" });
  }

  return { state, restore, send, stop, reset, actOnDraft, rateAnswer };
}

let lastEntry = 0;

// Keys for rendered entries. Time-prefixed so they never repeat ids restored from storage.
// (crypto.randomUUID needs a secure context, which a phone testing over the LAN lacks.)
function entryId(): string {
  lastEntry += 1;
  return `${Date.now().toString(36)}-${lastEntry}`;
}

function noticeFor(error: unknown): ChatNotice {
  if (error instanceof PublicApiError) {
    if (error.kind === "limited") return "limited";
    if (error.kind === "unavailable") return "unavailable";
  }
  return "failed";
}
