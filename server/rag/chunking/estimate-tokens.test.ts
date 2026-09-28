import { expect, test } from "bun:test";

import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";

test("estimateTokens rounds characters / 4 up", () => {
  expect(estimateTokens("")).toBe(0);
  expect(estimateTokens("a")).toBe(1);
  expect(estimateTokens("abcd")).toBe(1);
  expect(estimateTokens("abcde")).toBe(2);
  expect(estimateTokens("x".repeat(1400))).toBe(350);
});
