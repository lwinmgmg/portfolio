import { expect, test } from "bun:test";

import type { EmbeddingClient } from "@/server/domain/llm";
import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { embedInBatches } from "@/server/rag/embedding/embed-in-batches";
import { EmbeddingError } from "@/server/rag/embedding/embedding-error";
import { l2Normalize } from "@/server/rag/embedding/l2-normalize";

function recordingClient(vectorFor: (text: string) => number[] = (text) => [text.length, 1]) {
  const batches: string[][] = [];
  const client: EmbeddingClient = {
    embed: async ({ texts }) => {
      batches.push(texts);
      return { vectors: texts.map(vectorFor), usage: null };
    },
  };
  return { client, batches };
}

async function rejection(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

test("texts are embedded in batches and vectors keep the text order", async () => {
  const { client, batches } = recordingClient();
  const texts = ["a", "bb", "ccc", "dddd", "eeeee"];

  const vectors = await embedInBatches(client, "embed-model", texts, 2);

  expect(batches).toEqual([["a", "bb"], ["ccc", "dddd"], ["eeeee"]]);
  expect(vectors).toEqual([
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 1],
  ]);
});

test("the default batch size is 64", async () => {
  const { client, batches } = recordingClient();
  await embedInBatches(
    client,
    "m",
    Array.from({ length: 130 }, (_, index) => `t${index}`),
  );

  expect(batches.map((batch) => batch.length)).toEqual([64, 64, 2]);
});

test("no texts means no call", async () => {
  const { client, batches } = recordingClient();
  expect(await embedInBatches(client, "m", [])).toEqual([]);
  expect(batches.length).toBe(0);
});

test("a wrong vector count, mixed sizes or invalid numbers are rejected", async () => {
  const short: EmbeddingClient = { embed: async () => ({ vectors: [[1]], usage: null }) };
  const mixed = recordingClient((text) => (text === "a" ? [1] : [1, 2])).client;
  const invalid = recordingClient(() => [Number.NaN, 1]).client;

  for (const client of [short, mixed, invalid]) {
    expect((await rejection(embedInBatches(client, "m", ["a", "b"]))) instanceof EmbeddingError).toBe(
      true,
    );
  }
});

test("l2Normalize scales to unit length", () => {
  expect(l2Normalize([3, 4])).toEqual([0.6, 0.8]);
  const unit = l2Normalize([1, 2, 2]);
  expect(Math.abs(Math.hypot(...unit) - 1)).toBeLessThan(1e-12);
});

test("a zero vector cannot be normalized", () => {
  expect(thrownBy(() => l2Normalize([0, 0])) instanceof EmbeddingError).toBe(true);
});
