import { expect, test } from "bun:test";

import { contactEmailOutcome, sendContactEmail } from "@/client/api/contact-email";

type Call = { url: string; method: string; body: string | null };

// Swaps the global fetch for one test. Replies are used in order; an Error reply rejects.
async function withFetch<T>(
  replies: ({ status: number; body?: string } | Error)[],
  run: (calls: Call[]) => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected fetch");
    if (reply instanceof Error) throw reply;
    return new Response(reply.body ?? null, { status: reply.status });
  };
  globalThis.fetch = fake as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const REQUEST = { conversationId: "c1", draftId: "d1", action: "send" as const };

test("posts the action and reads the status", async () => {
  const outcome = await withFetch([{ status: 200, body: '{"status":"sent"}' }], async (calls) => {
    const result = await sendContactEmail(REQUEST);
    expect(calls).toEqual([
      { url: "/api/public/chat/email", method: "POST", body: JSON.stringify(REQUEST) },
    ]);
    return result;
  });
  expect(outcome).toBe("sent");
});

test("issues a session after a 401 and sends the same body again", async () => {
  await withFetch(
    [{ status: 401 }, { status: 204 }, { status: 200, body: '{"status":"discarded"}' }],
    async (calls) => {
      expect(await sendContactEmail({ ...REQUEST, action: "discard" })).toBe("discarded");
      expect(calls.map((call) => call.url)).toEqual([
        "/api/public/chat/email",
        "/api/public/session",
        "/api/public/chat/email",
      ]);
      expect(calls[2]?.body).toBe(calls[0]?.body ?? "missing");
    },
  );
});

test("a request that never got an answer is failed", async () => {
  expect(await withFetch([new TypeError("offline")], () => sendContactEmail(REQUEST))).toBe("failed");
});

test("contactEmailOutcome maps the route's status codes", () => {
  expect(contactEmailOutcome(200, { status: "sent" })).toBe("sent");
  expect(contactEmailOutcome(200, { status: "discarded" })).toBe("discarded");
  expect(contactEmailOutcome(200, { status: "queued" })).toBe("failed");
  expect(contactEmailOutcome(200, undefined)).toBe("failed");
  expect(contactEmailOutcome(429, { status: "limit" })).toBe("limit");
  expect(contactEmailOutcome(429, { error: "session_exhausted" })).toBe("limit");
  expect(contactEmailOutcome(404, { status: "not_found" })).toBe("not_found");
  expect(contactEmailOutcome(410, { status: "expired" })).toBe("expired");
  expect(contactEmailOutcome(502, { status: "failed" })).toBe("failed");
  expect(contactEmailOutcome(503, { error: "unavailable" })).toBe("unavailable");
  expect(contactEmailOutcome(400, { error: "invalid_request" })).toBe("failed");
  expect(contactEmailOutcome(500, { error: "unavailable" })).toBe("failed");
});
