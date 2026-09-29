import { expect, test } from "bun:test";

import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import {
  contextSummary,
  formatCost,
  formatCount,
  formatDuration,
  indexLabel,
} from "@/app/admin/(panel)/rag/rag-format";

test("formatDuration picks ms, seconds or minutes", () => {
  expect(formatDuration(0)).toBe("0 ms");
  expect(formatDuration(850)).toBe("850 ms");
  expect(formatDuration(12_340)).toBe("12.3 s");
  expect(formatDuration(95_000)).toBe("1 min 35 s");
});

test("formatCost keeps small amounts readable", () => {
  expect(formatCost(null)).toBe("—");
  expect(formatCost(0)).toBe("$0");
  expect(formatCost(0.000123)).toBe("$0.00012");
  expect(formatCost(1.5)).toBe("$1.50");
});

test("formatCount groups thousands", () => {
  expect(formatCount(12_345)).toBe("12,345");
});

test("contextSummary names the context model", () => {
  const base = { chunker: "structured" as const, embeddingModel: "e" };
  expect(contextSummary({ ...base, contextualize: true, contextModel: "u" })).toBe("Yes (u)");
  expect(contextSummary({ ...base, contextualize: false, contextModel: null })).toBe("No");
});

test("indexLabel names the chunker, context, build time and active flag", () => {
  const config = { chunker: "structured" as const, embeddingModel: "e", contextualize: true, contextModel: "u" };
  const createdAt = "2026-09-29T08:00:00.000Z";
  expect(indexLabel({ config, createdAt, active: true })).toBe(
    `structured + context · ${formatWhen(createdAt)} (active)`,
  );
  expect(
    indexLabel({
      config: { ...config, chunker: "token-window", contextualize: false, contextModel: null },
      createdAt,
      active: false,
    }),
  ).toBe(`token-window · ${formatWhen(createdAt)}`);
});
