import { expect, test } from "bun:test";

import { EventChannel } from "@/server/rag/progress/event-channel";

async function drain<T>(channel: EventChannel<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of channel) items.push(item);
  return items;
}

test("items pushed before reading are read in order, then the close ends the loop", async () => {
  const channel = new EventChannel<number>();
  channel.push(1);
  channel.push(2);
  channel.close();

  expect(await drain(channel)).toEqual([1, 2]);
});

test("a waiting reader gets each item as it is pushed", async () => {
  const channel = new EventChannel<string>();
  const iterator = channel[Symbol.asyncIterator]();

  const first = iterator.next();
  channel.push("a");
  expect(await first).toEqual({ value: "a", done: false });

  const second = iterator.next();
  channel.push("b");
  channel.close();
  expect(await second).toEqual({ value: "b", done: false });
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test("items pushed from callbacks are read while the work that pushes them is pending", async () => {
  const channel = new EventChannel<string>();
  const release = Promise.withResolvers<void>();
  const work = (async () => {
    channel.push("started");
    await release.promise;
    channel.push("ended");
  })();
  void work.then(() => channel.close());
  const iterator = channel[Symbol.asyncIterator]();

  expect(await iterator.next()).toEqual({ value: "started", done: false });
  release.resolve();
  expect(await iterator.next()).toEqual({ value: "ended", done: false });
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test("close wakes a waiting reader with done", async () => {
  const channel = new EventChannel<number>();
  const iterator = channel[Symbol.asyncIterator]();

  const waiting = iterator.next();
  channel.close();

  expect(await waiting).toEqual({ value: undefined, done: true });
});

test("fail delivers the buffered items, then throws the error once", async () => {
  const channel = new EventChannel<number>();
  channel.push(1);
  channel.fail(new Error("pipeline failed"));
  const iterator = channel[Symbol.asyncIterator]();

  expect(await iterator.next()).toEqual({ value: 1, done: false });
  await expect(iterator.next()).rejects.toMatchObject({ message: "pipeline failed" });
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

test("fail rejects a waiting reader and ends a for-await loop", async () => {
  const channel = new EventChannel<number>();
  const read: number[] = [];
  const reading = (async () => {
    for await (const item of channel) read.push(item);
  })();

  channel.push(7);
  channel.fail(new Error("pipeline failed"));

  await expect(reading).rejects.toMatchObject({ message: "pipeline failed" });
  expect(read).toEqual([7]);
});

test("pushes after the end are ignored, and only the first end counts", async () => {
  const channel = new EventChannel<number>();
  channel.push(1);
  channel.close();
  channel.push(2);
  channel.fail(new Error("too late"));

  expect(await drain(channel)).toEqual([1]);
});

test("a reader that stops early drops what is buffered and later pushes", async () => {
  const channel = new EventChannel<number>();
  channel.push(1);
  channel.push(2);
  channel.push(3);

  for await (const item of channel) {
    expect(item).toBe(1);
    break;
  }
  channel.push(4);

  expect(await drain(channel)).toEqual([]);
});
