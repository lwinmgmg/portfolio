import { expect, test } from "bun:test";

import { packWords, spansOverlap, wordSpans } from "@/server/rag/chunking/text-spans";

test("wordSpans finds every non-whitespace run", () => {
  expect(wordSpans("  ab c\n\n- d ")).toEqual([
    { start: 2, end: 4 },
    { start: 5, end: 6 },
    { start: 8, end: 9 },
    { start: 10, end: 11 },
  ]);
  expect(wordSpans(" \n ")).toEqual([]);
});

test("spansOverlap treats spans as half-open", () => {
  expect(spansOverlap({ start: 0, end: 5 }, { start: 4, end: 8 })).toBe(true);
  expect(spansOverlap({ start: 0, end: 5 }, { start: 5, end: 8 })).toBe(false);
  expect(spansOverlap({ start: 2, end: 3 }, { start: 0, end: 8 })).toBe(true);
});

test("packWords makes the longest slices that fit and keeps inner whitespace", () => {
  const fits = (slice: string) => slice.length <= 9;
  expect(packWords("one two\nthree four", fits)).toEqual(["one two", "three", "four"]);
});

test("packWords keeps an oversized word whole", () => {
  expect(packWords("a enormous b", (slice) => slice.length <= 3)).toEqual(["a", "enormous", "b"]);
  expect(packWords("   ", () => true)).toEqual([]);
});
