import { expect, test } from "bun:test";

import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { LruCache } from "@/server/rag/search/lru-cache";

test("adding past capacity evicts the least recently used entry", () => {
  const cache = new LruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  expect(cache.get("a")).toBe(1);
  cache.set("c", 3);

  expect(cache.keys()).toEqual(["a", "c"]);
  expect(cache.get("b")).toBe(undefined);
});

test("peek does not refresh an entry and set replaces one", () => {
  const cache = new LruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  expect(cache.peek("a")).toBe(1);
  cache.set("b", 20);
  cache.set("c", 3);

  expect(cache.keys()).toEqual(["b", "c"]);
  expect(cache.get("b")).toBe(20);
  expect(cache.size).toBe(2);
});

test("delete removes an entry", () => {
  const cache = new LruCache<string, number>(1);
  cache.set("a", 1);
  expect(cache.delete("a")).toBe(true);
  expect(cache.delete("a")).toBe(false);
  expect(cache.size).toBe(0);
});

test("capacity must be a positive integer", () => {
  expect(thrownBy(() => new LruCache(0)) instanceof RangeError).toBe(true);
});
