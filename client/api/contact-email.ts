"use client";

import { isRecord } from "@/client/api/chat-steps";
import { postPublicJson } from "@/client/api/public-http";

const CONTACT_EMAIL_PATH = "/api/public/chat/email";

export type ContactEmailRequest = {
  conversationId: string;
  draftId: string;
  action: "send" | "discard";
};

// The server's results (`POST /api/public/chat/email`), plus `failed` for a request that never
// got an answer.
export type ContactEmailOutcome =
  | "sent"
  | "discarded"
  | "limit"
  | "not_found"
  | "expired"
  | "failed"
  | "unavailable";

// Never throws: a network failure is `failed`, like a refused send.
export async function sendContactEmail(request: ContactEmailRequest): Promise<ContactEmailOutcome> {
  try {
    const response = await postPublicJson(CONTACT_EMAIL_PATH, JSON.stringify(request));
    return contactEmailOutcome(response.status, response.body);
  } catch {
    return "failed";
  }
}

export function contactEmailOutcome(status: number, body: unknown): ContactEmailOutcome {
  switch (status) {
    case 200: {
      const result = isRecord(body) ? body.status : undefined;
      return result === "sent" || result === "discarded" ? result : "failed";
    }
    case 404:
      return "not_found";
    case 410:
      return "expired";
    // Also the public session's own limits, which end this visit's sends just the same.
    case 429:
      return "limit";
    case 503:
      return "unavailable";
    default:
      return "failed";
  }
}
