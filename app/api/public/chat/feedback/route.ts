import "server-only";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { publicJson } from "@/server/http/public-json";
import { withPublicSession } from "@/server/http/require-public-session";
import { rateChatAnswer } from "@/server/services/chat-runtime";

const FeedbackSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  // A conversation holds at most 2 messages per allowed question; the bound only keeps the index sane.
  messageIndex: z.number().int().min(0).max(1_000),
  value: z.enum(["up", "down"]),
});

// The visitor's thumb on an assistant message of their own conversation.
export async function POST(request: NextRequest) {
  return withPublicSession(request, async ({ sessionId }) => {
    const body = FeedbackSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return publicJson({ error: "invalid_request" }, 400);

    const status = await rateChatAnswer({ sessionId, ...body.data });
    return publicJson({ status }, status === "saved" ? 200 : 404);
  });
}
