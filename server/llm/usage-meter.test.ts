import { expect, test } from "bun:test";

import type { ChatClient, ChatStreamEvent, EmbeddingClient, Usage } from "@/server/domain/llm";
import { UsageMeter } from "@/server/llm/usage-meter";

const usage = (cost: number | null): Usage => ({ promptTokens: 10, completionTokens: 2, cost });

const chat: ChatClient = {
  complete: async (request) => ({ text: "ok", usage: usage(0.25), model: request.model }),
  async *stream(): AsyncIterable<ChatStreamEvent> {
    yield { type: "delta", text: "o" };
    yield { type: "done", usage: usage(0.5) };
  },
};

const embeddings: EmbeddingClient = {
  embed: async (input) => ({ vectors: input.texts.map(() => [1]), usage: usage(null) }),
};

test("wrapped clients pass results through and add up usage", async () => {
  const meter = new UsageMeter();

  const result = await meter.chat(chat).complete({ model: "m", messages: [] });
  const events: ChatStreamEvent[] = [];
  for await (const event of meter.chat(chat).stream({ model: "m", messages: [] })) {
    events.push(event);
  }
  const embedded = await meter.embeddings(embeddings).embed({ model: "e", texts: ["a", "b"] });

  expect(result.text).toBe("ok");
  expect(events.length).toBe(2);
  expect(embedded.vectors).toEqual([[1], [1]]);
  expect(meter.costUsd).toBe(0.75);
  expect(meter.tokens).toEqual({ prompt: 30, completion: 6 });
});

test("cost is null until a call reports one", () => {
  const meter = new UsageMeter();
  meter.record(null);
  meter.record(usage(null));

  expect(meter.costUsd).toBeNull();

  meter.record(usage(0));
  expect(meter.costUsd).toBe(0);
});
