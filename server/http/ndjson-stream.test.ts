import { expect, test } from "bun:test";

import { ndjsonStream } from "@/server/http/ndjson-stream";

type Event = { type: string; n?: number };

async function readAll(body: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(body).text();
}

test("each event becomes one JSON line", async () => {
  async function* events(): AsyncGenerator<Event> {
    yield { type: "a", n: 1 };
    yield { type: "b" };
  }
  const stream = ndjsonStream(events(), { onError: () => null });

  expect(await readAll(stream.body)).toBe('{"type":"a","n":1}\n{"type":"b"}\n');
  await stream.finished;
});

test("a thrown error ends the stream with the onError line", async () => {
  const errors: unknown[] = [];
  async function* events(): AsyncGenerator<Event> {
    yield { type: "a" };
    throw new Error("boom");
  }
  const stream = ndjsonStream(events(), {
    onError: (error) => {
      errors.push(error);
      return { type: "error" };
    },
  });

  expect(await readAll(stream.body)).toBe('{"type":"a"}\n{"type":"error"}\n');
  expect(errors).toHaveLength(1);
  await stream.finished;
});

test("cancelling runs the iterator's finally blocks before finished settles", async () => {
  const steps: string[] = [];
  async function* events(): AsyncGenerator<Event> {
    try {
      yield { type: "a" };
      yield { type: "b" };
      steps.push("not reached");
    } finally {
      await Promise.resolve();
      steps.push("cleanup");
    }
  }
  let cancelled = 0;
  const stream = ndjsonStream(events(), {
    onError: () => null,
    onCancel: () => {
      cancelled += 1;
    },
  });
  const reader = stream.body.getReader();
  const first = await reader.read();

  expect(new TextDecoder().decode(first.value)).toBe('{"type":"a"}\n');
  await reader.cancel();
  await stream.finished;
  expect(cancelled).toBe(1);
  expect(steps).toEqual(["cleanup"]);
});
