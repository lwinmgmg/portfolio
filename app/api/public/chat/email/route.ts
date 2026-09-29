import "server-only";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { publicJson } from "@/server/http/public-json";
import { withPublicSession } from "@/server/http/require-public-session";
import { discardContactEmail, sendContactEmail } from "@/server/services/chat-runtime";
import type { DiscardResult, SendResult } from "@/server/services/contact-email-service";

// One Gmail send (15 s per request, plus a token refresh) and the draft writes around it.
export const maxDuration = 30;

const EmailActionSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  draftId: z.string().trim().min(1).max(64),
  action: z.enum(["send", "discard"]),
});

const HTTP_STATUS: Record<SendResult | DiscardResult, number> = {
  sent: 200,
  discarded: 200,
  limit: 429,
  not_found: 404,
  expired: 410,
  failed: 502,
  unavailable: 503,
};

// The visitor's Send or Discard on a chat email draft.
export async function POST(request: NextRequest) {
  return withPublicSession(request, async ({ sessionId }) => {
    const body = EmailActionSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return publicJson({ error: "invalid_request" }, 400);

    const { action, conversationId, draftId } = body.data;
    const target = { sessionId, conversationId, draftId };
    const status =
      action === "send" ? await sendContactEmail(target) : await discardContactEmail(target);
    // Same body as the other routes' 503, which withPublicSession also answers.
    if (status === "unavailable") return publicJson({ error: "unavailable" }, HTTP_STATUS[status]);
    return publicJson({ status }, HTTP_STATUS[status]);
  });
}
