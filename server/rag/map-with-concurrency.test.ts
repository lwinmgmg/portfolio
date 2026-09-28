import { expect, test } from "bun:test";

import { mapWithConcurrency } from "@/server/rag/map-with-concurrency";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("results keep the input order when tasks finish out of order", async () => {
  const results = await mapWithConcurrency([30, 10, 20], 3, async (delay, index) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    return `${index}:${delay}`;
  });

  expect(results).toEqual(["0:30", "1:10", "2:20"]);
});

test("no more than `limit` tasks run at once", async () => {
  let running = 0;
  let peak = 0;
  const gates = Array.from({ length: 6 }, deferred);

  const done = mapWithConcurrency(gates, 2, async (gate) => {
    running += 1;
    peak = Math.max(peak, running);
    await gate.promise;
    running -= 1;
  });
  for (const gate of gates) {
    await Promise.resolve();
    gate.resolve();
  }
  await done;

  expect(peak).toBe(2);
});

test("an empty list resolves without running a task", async () => {
  let calls = 0;
  expect(
    await mapWithConcurrency([], 4, async () => {
      calls += 1;
    }),
  ).toEqual([]);
  expect(calls).toBe(0);
});

test("the limit must be a positive integer", async () => {
  const error = await mapWithConcurrency([1], 0, async (value) => value).catch(
    (reason: unknown) => reason,
  );
  expect(error instanceof RangeError).toBe(true);
});
