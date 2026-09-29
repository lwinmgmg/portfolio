import "server-only";

import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { CHAT_MESSAGE_MAX_CHARS, type ChatEvent } from "@/server/domain/chat";
import { ndjsonStream } from "@/server/http/ndjson-stream";
import { publicJson } from "@/server/http/public-json";
import { withPublicSession } from "@/server/http/require-public-session";
import { isChatConfigured, replyToChat } from "@/server/services/chat-runtime";

// Retrieval plus a streamed answer, and saving the turn after a visitor stops it.
export const maxDuration = 60;

const ChatBodySchema = z.object({
  conversationId: z.string().trim().min(1).max(64).nullable(),
  message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS),
});

const UNAVAILABLE: ChatEvent = { type: "error", code: "unavailable" };

export async function POST(request: NextRequest) {
  if (!isChatConfigured()) return publicJson({ error: "unavailable" }, 503);

  return withPublicSession(request, async ({ sessionId }) => {
    const body = ChatBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return publicJson({ error: "invalid_request" }, 400);

    // Stops the answer model when the visitor aborts the fetch or the response is cancelled.
    const stop = new AbortController();
    const abort = () => stop.abort();
    request.signal.addEventListener("abort", abort, { once: true });

    const stream = ndjsonStream(
      replyToChat({
        sessionId,
        conversationId: body.data.conversationId,
        message: body.data.message,
        signal: stop.signal,
      }),
      {
        onError: (error) => {
          console.error("Chat reply failed.", error);
          return UNAVAILABLE;
        },
        onCancel: abort,
      },
    );
    // Keeps the function alive until a stopped answer has been stored.
    after(() => stream.finished.finally(() => request.signal.removeEventListener("abort", abort)));

    return new NextResponse(stream.body, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
