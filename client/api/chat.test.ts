import { expect, test } from "bun:test";

import { parseChatEvent, streamChat } from "@/client/api/chat";
import type { ChatEvent } from "@/server/domain/chat";

type Call = { url: string; method: string; body: string | null };

type Reply = { status: number; body?: ReadableStream<Uint8Array> | string };

// Swaps the global fetch for one test. Replies are used in order.
async function withFetch<T>(replies: Reply[], run: (calls: Call[]) => Promise<T>): Promise<T> {
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
    return new Response(reply.body ?? null, { status: reply.status });
  };
  globalThis.fetch = fake as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

function lines(events: readonly unknown[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

const SOURCE = {
  sourceId: "S1",
  entityKeys: ["experience:acme"],
  title: "Senior Engineer",
  section: "experience",
  anchor: "#experience-acme",
};

const REQUEST = { conversationId: null, message: "Where does Jane work?" };

test("streams the events in order and reports a complete answer", async () => {
  const events: ChatEvent[] = [];
  const running = { startedAt: 0, durationMs: null, detail: null, status: "running" };
  const stream = [
    { type: "meta", conversationId: "c1" },
    { type: "step", step: { ...running, name: "rewrite" } },
    {
      type: "step",
      step: {
        name: "rewrite",
        status: "done",
        startedAt: 0,
        durationMs: 800,
        detail: { kind: "rewrite", queries: ["Jane employer"], scope: "cv", fallback: false },
      },
    },
    { type: "step", step: { ...running, name: "reasoning", startedAt: 900 } },
    { type: "reasoning", text: "The CV says Acme." },
    { type: "delta", text: "At Acme [S1]." },
    { type: "sources", sources: [SOURCE] },
    { type: "done" },
  ];
  const end = await withFetch([{ status: 200, body: lines(stream) }], async (calls) => {
    const result = await streamChat(REQUEST, (event) => events.push(event));
    expect(calls).toEqual([
      { url: "/api/public/chat", method: "POST", body: JSON.stringify(REQUEST) },
    ]);
    return result;
  });
  expect(end).toBe("complete");
  expect(events).toEqual(stream as ChatEvent[]);
});

test("issues a session after a 401 and sends the same body again", async () => {
  const replies: Reply[] = [
    { status: 401, body: '{"error":"session_invalid"}' },
    { status: 204 },
    { status: 200, body: lines([{ type: "limit", code: "session_limit" }]) },
  ];
  await withFetch(replies, async (calls) => {
    const events: ChatEvent[] = [];
    expect(await streamChat(REQUEST, (event) => events.push(event))).toBe("complete");
    expect(events).toEqual([{ type: "limit", code: "session_limit" }]);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /api/public/chat",
      "POST /api/public/session",
      "POST /api/public/chat",
    ]);
    expect(calls[2]?.body).toBe(JSON.stringify(REQUEST));
  });
});

test("maps 429 to limited and 503 to unavailable", async () => {
  await withFetch([{ status: 429, body: "{}" }, { status: 503, body: "{}" }], async () => {
    await expect(streamChat(REQUEST, () => {})).rejects.toMatchObject({ kind: "limited" });
    await expect(streamChat(REQUEST, () => {})).rejects.toMatchObject({ kind: "unavailable" });
  });
});

test("a failed session issuance is reported with its own status", async () => {
  await withFetch([{ status: 401 }, { status: 429 }], async () => {
    await expect(streamChat(REQUEST, () => {})).rejects.toMatchObject({ kind: "limited" });
  });
});

test("aborting stops the stream and cancels the body", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines([{ type: "delta", text: "Jane" }])));
    },
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const texts: string[] = [];
  const end = await withFetch([{ status: 200, body }], () =>
    streamChat(
      REQUEST,
      (event) => {
        if (event.type === "delta") texts.push(event.text);
        controller.abort();
      },
      { signal: controller.signal },
    ),
  );
  expect(end).toBe("stopped");
  expect(texts).toEqual(["Jane"]);
  expect(cancelled).toBe(true);
});

test("a body that ends without a final event is interrupted", async () => {
  const body = lines([{ type: "meta", conversationId: "c1" }, { type: "delta", text: "Ja" }]);
  const end = await withFetch([{ status: 200, body }], () => streamChat(REQUEST, () => {}));
  expect(end).toBe("interrupted");
});

test("parseChatEvent accepts known events and rejects the rest", () => {
  expect(parseChatEvent({ type: "error", code: "unavailable" })).toEqual({
    type: "error",
    code: "unavailable",
  });
  expect(parseChatEvent({ type: "sources", sources: [SOURCE] })).toEqual({
    type: "sources",
    sources: [SOURCE],
  });
  expect(parseChatEvent({ type: "email_draft", draft: { id: "d1", text: "Hi", extra: 1 } })).toEqual({
    type: "email_draft",
    draft: { id: "d1", text: "Hi" },
  });
  expect(parseChatEvent({ type: "email_draft", draft: { id: "d1" } })).toBeNull();
  expect(parseChatEvent({ type: "email_draft", draft: "Hi" })).toBeNull();
  expect(parseChatEvent({ type: "error", code: "boom" })).toBeNull();
  expect(parseChatEvent({ type: "delta", text: 3 })).toBeNull();
  expect(parseChatEvent({ type: "trace", id: "t1" })).toBeNull();
  expect(parseChatEvent([{ type: "done" }])).toBeNull();
  expect(
    parseChatEvent({ type: "sources", sources: [{ ...SOURCE, anchor: "javascript:alert(1)" }] }),
  ).toBeNull();
});
