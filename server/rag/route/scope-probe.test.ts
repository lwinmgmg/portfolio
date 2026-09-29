import { expect, test } from "bun:test";

import type { RouteScope } from "@/server/domain/rag";
import type { ScopeReading } from "@/server/rag/route/route-question";
import {
  expectedScopes,
  parseProbeSet,
  probeTotals,
  ProbeSetError,
  summarizeCutoff,
  type ProbeOutcome,
} from "@/server/rag/route/scope-probe";

function outcome(
  expected: RouteScope,
  reading: ScopeReading,
  latencyMs = 100,
): ProbeOutcome {
  return { item: { id: `${expected}-${latencyMs}`, expected, message: "m", history: [] }, reading, latencyMs };
}

function read(choice: RouteScope, probability: number): ScopeReading {
  const rest = (1 - probability) / 2;
  const probabilities: Record<RouteScope, number> = { cv: rest, smalltalk: rest, off_topic: rest };
  probabilities[choice] = probability;
  return { ok: true, choice, probabilities };
}

function captureError(work: () => unknown): Error {
  try {
    work();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected an error");
}

test("parses a probe file and defaults the history", () => {
  const set = parseProbeSet({
    subject: "Ada",
    items: [
      { id: "a", expected: "smalltalk", message: "hi" },
      { id: "b", expected: "cv", message: "and before that?", history: [{ role: "user", text: "where?" }] },
    ],
  });

  expect(set.items[0]?.history).toEqual([]);
  expect(expectedScopes(set)).toEqual({ cv: 1, smalltalk: 1, off_topic: 0 });
});

test("rejects duplicate ids, unknown scopes and extra keys", () => {
  const item = { id: "a", expected: "cv", message: "hi" };
  const duplicate = captureError(() => parseProbeSet({ subject: "Ada", items: [item, item] }));
  const unknownScope = captureError(() =>
    parseProbeSet({ subject: "Ada", items: [{ ...item, expected: "weather" }] }),
  );
  const extraKey = captureError(() => parseProbeSet({ subject: "Ada", items: [{ ...item, note: "x" }] }));

  expect(duplicate instanceof ProbeSetError).toBe(true);
  expect(duplicate.message).toContain('"a"');
  expect(unknownScope instanceof ProbeSetError).toBe(true);
  expect(extraKey instanceof ProbeSetError).toBe(true);
});

test("a cutoff counts deferrals, short-circuits and skipped CV questions", () => {
  const outcomes = [
    outcome("cv", read("cv", 0.9)),
    outcome("cv", read("smalltalk", 0.75)),
    outcome("smalltalk", read("smalltalk", 0.85)),
    outcome("off_topic", read("off_topic", 0.65)),
    outcome("off_topic", read("smalltalk", 0.95)),
    outcome("smalltalk", { ok: false, error: "429" }),
  ];

  expect(summarizeCutoff(outcomes, 0.7)).toEqual({
    cutoff: 0.7,
    total: 6,
    correct: 2,
    cvSkipped: 1,
    cvTotal: 2,
    missedShortCircuits: 2,
    wrongShortCircuits: 1,
  });
  expect(summarizeCutoff(outcomes, 0.6)).toMatchObject({ correct: 3, cvSkipped: 1, missedShortCircuits: 1 });
  expect(summarizeCutoff(outcomes, 0.9)).toMatchObject({ correct: 2, cvSkipped: 0, missedShortCircuits: 3 });
});

test("totals count errors, top-choice matches and latency over answered items", () => {
  const totals = probeTotals([
    outcome("cv", read("cv", 0.9), 300),
    outcome("smalltalk", read("off_topic", 0.9), 100),
    outcome("off_topic", read("off_topic", 0.9), 200),
    outcome("cv", { ok: false, error: "timeout" }, 5000),
  ]);

  expect(totals).toEqual({ total: 4, errors: 1, choiceMatches: 2, latencyMs: { median: 200, max: 300 } });
  expect(probeTotals([outcome("cv", { ok: false, error: "x" })]).latencyMs).toBeNull();
});
