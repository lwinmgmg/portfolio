"use client";

import { postPublicJson } from "@/client/api/public-http";
import type { ChatFeedback } from "@/server/domain/chat";

const FEEDBACK_PATH = "/api/public/chat/feedback";

export type FeedbackRequest = { conversationId: string; messageIndex: number; value: ChatFeedback };

// Whether the server stored the thumb. Never throws: a network failure is a refusal.
export async function sendChatFeedback(request: FeedbackRequest): Promise<boolean> {
  try {
    const response = await postPublicJson(FEEDBACK_PATH, JSON.stringify(request));
    return response.status === 200;
  } catch {
    return false;
  }
}
