import { expect, test } from "bun:test";

import { readNdjson } from "@/client/api/ndjson";

function bodyOf(chunks: ReadonlyArray<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of readNdjson(body, signal)) values.push(value);
  return values;
}

test("joins lines split across chunks", async () => {
  const values = await collect(bodyOf(['{"type":"del', 'ta","text":"a"}\n{"type"', ':"done"}\n']));
  expect(values).toEqual([{ type: "delta", text: "a" }, { type: "done" }]);
});

test("decodes a character split across chunks", async () => {
  const bytes = new TextEncoder().encode('{"text":"café"}\n');
  const cut = bytes.length - 3; // inside the two bytes of "é"
  const values = await collect(bodyOf([bytes.slice(0, cut), bytes.slice(cut)]));
  expect(values).toEqual([{ text: "café" }]);
});

test("reads a last line without a newline and skips blank and invalid lines", async () => {
  const values = await collect(bodyOf(['{"a":1}\n\n', "not json\n", '{"b":2}']));
  expect(values).toEqual([{ a: 1 }, { b: 2 }]);
});

test("aborting cancels the body and ends the reader", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"a":1}\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const values: unknown[] = [];
  for await (const value of readNdjson(body, controller.signal)) {
    values.push(value);
    controller.abort();
  }
  expect(values).toEqual([{ a: 1 }]);
  expect(cancelled).toBe(true);
});

test("an already aborted signal reads nothing", async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await collect(bodyOf(['{"a":1}\n']), controller.signal)).toEqual([]);
});
