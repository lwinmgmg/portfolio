import { expect, test } from "bun:test";

import { parseSse } from "@/server/llm/sse";

async function collect(chunks: string[]): Promise<string[]> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const values: string[] = [];
  for await (const value of parseSse(stream)) values.push(value);
  return values;
}

test("parses split chunks, comments, multiline data, and stops at DONE", async () => {
  const raw = [
    "event: message\n",
    "data: one\n",
    "data: two\n",
    "\n",
    ": OPENROUTER PROCESSING\n",
    "\n",
    "data: [DONE]\n",
    "\n",
    "data: hidden\n",
    "\n",
  ].join("");

  expect(await collect([...raw])).toEqual(["one\ntwo"]);
});

test("accepts CRLF and strips one leading space from data fields", async () => {
  const raw = ": OPENROUTER PROCESSING\r\n\r\ndata:  hello\r\n\r\ndata:[DONE]\r\n\r\n";
  expect(await collect([raw])).toEqual([" hello"]);
});

test("yields a final event that has no trailing blank line", async () => {
  expect(await collect(["data: hi"])).toEqual(["hi"]);
  expect(await collect(["data: [DONE]"])).toEqual([]);
});
