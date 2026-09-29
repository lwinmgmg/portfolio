import { z } from "zod";

import type { QueryScope, RewriteResult, RouteScope } from "@/server/domain/rag";
import { shortCircuitScope, type ScopeReading } from "@/server/rag/route/route-question";

// The cutoffs the probe compares before one is picked for `minRouteConfidence`.
export const PROBE_CUTOFFS = [0.6, 0.7, 0.8, 0.9] as const;

// The router only sees three scopes; `contact` and `injection` items check that it defers on them.
const ScopeSchema = z.enum([
  "cv",
  "smalltalk",
  "off_topic",
  "contact",
  "injection",
]) satisfies z.ZodType<QueryScope>;

const ProbeItemSchema = z.strictObject({
  id: z.string().min(1),
  expected: ScopeSchema,
  message: z.string().trim().min(1),
  history: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().min(1) }))
    .default([]),
});

const ProbeSetSchema = z.strictObject({
  subject: z.string().trim().min(1),
  items: z.array(ProbeItemSchema).min(1),
});

export type ProbeItem = z.infer<typeof ProbeItemSchema>;
export type ProbeSet = z.infer<typeof ProbeSetSchema>;

export class ProbeSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeSetError";
  }
}

export function parseProbeSet(value: unknown): ProbeSet {
  const parsed = ProbeSetSchema.safeParse(value);
  if (!parsed.success) throw new ProbeSetError(`Invalid probe file: ${z.prettifyError(parsed.error)}`);
  const seen = new Set<string>();
  for (const item of parsed.data.items) {
    if (seen.has(item.id)) throw new ProbeSetError(`Duplicate probe id "${item.id}"`);
    seen.add(item.id);
  }
  return parsed.data;
}

// A provider error is recorded as an unreadable answer, as the router would treat it.
export type ProbeOutcome = {
  item: ProbeItem;
  reading: ScopeReading;
  latencyMs: number;
};

export type CutoffSummary = {
  cutoff: number;
  total: number;
  // cv items deferred plus non-cv items short-circuited to the right scope.
  correct: number;
  // Real CV questions and contact requests that would have skipped retrieval: the costly mistake.
  cvSkipped: number;
  cvTotal: number;
  // Injections the router answered itself, so the rewriter never flags them (Phase 2.15).
  injectionsShortCircuited: number;
  // Small talk or off topic sent on to the rewriter: a missed saving, not a wrong answer.
  missedShortCircuits: number;
  // Small talk answered as off topic, or the reverse.
  wrongShortCircuits: number;
};

export function summarizeCutoff(outcomes: readonly ProbeOutcome[], cutoff: number): CutoffSummary {
  const summary: CutoffSummary = {
    cutoff,
    total: outcomes.length,
    correct: 0,
    cvSkipped: 0,
    cvTotal: 0,
    injectionsShortCircuited: 0,
    missedShortCircuits: 0,
    wrongShortCircuits: 0,
  };
  for (const { item, reading } of outcomes) {
    const routed = shortCircuitScope(reading, cutoff);
    if (item.expected === "cv" || item.expected === "contact") {
      summary.cvTotal += 1;
      if (routed === null) summary.correct += 1;
      else summary.cvSkipped += 1;
    } else if (item.expected === "injection") {
      if (routed === null) summary.correct += 1;
      else summary.injectionsShortCircuited += 1;
    } else if (routed === null) {
      summary.missedShortCircuits += 1;
    } else if (routed === item.expected) {
      summary.correct += 1;
    } else {
      summary.wrongShortCircuits += 1;
    }
  }
  return summary;
}

export type ProbeTotals = {
  total: number;
  errors: number;
  // The model's top choice matched the label, ignoring any cutoff. Errors count as misses.
  choiceMatches: number;
  latencyMs: { median: number; max: number } | null;
};

export function probeTotals(outcomes: readonly ProbeOutcome[]): ProbeTotals {
  const latencies = outcomes
    .filter((outcome) => outcome.reading.ok)
    .map((outcome) => outcome.latencyMs)
    .sort((left, right) => left - right);
  return {
    total: outcomes.length,
    errors: outcomes.filter((outcome) => !outcome.reading.ok).length,
    choiceMatches: outcomes.filter(
      ({ item, reading }) => reading.ok && reading.choice === routeScopeOf(item.expected),
    ).length,
    latencyMs:
      latencies.length === 0
        ? null
        : { median: median(latencies), max: latencies[latencies.length - 1] ?? 0 },
  };
}

// The option the router should pick: it reads `contact` and `injection` as `cv`.
function routeScopeOf(scope: QueryScope): RouteScope {
  return scope === "contact" || scope === "injection" ? "cv" : scope;
}

export function expectedScopes(set: ProbeSet): Record<QueryScope, number> {
  const counts: Record<QueryScope, number> = {
    cv: 0,
    smalltalk: 0,
    off_topic: 0,
    contact: 0,
    injection: 0,
  };
  for (const item of set.items) counts[item.expected] += 1;
  return counts;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

// What the rewriter said about one item. A string `raw` is its error message: it fell back to
// `cv`, as it does in the chat.
export type RewriterOutcome = {
  item: ProbeItem;
  result: RewriteResult;
  latencyMs: number;
};

export type RewriterSummary = {
  total: number;
  correct: number;
  fallbacks: number;
  // Injection items labelled otherwise. A fallback counts.
  injectionsMissed: number;
  // Item ids labelled `injection` that are not. Costly: a visitor or client (`cv`, `contact`)
  // would get a canned refusal. Cheap: off topic or small talk, which gets the same reply.
  falseInjections: { costly: string[]; cheap: string[] };
};

export function summarizeRewriter(outcomes: readonly RewriterOutcome[]): RewriterSummary {
  const summary: RewriterSummary = {
    total: outcomes.length,
    correct: 0,
    fallbacks: 0,
    injectionsMissed: 0,
    falseInjections: { costly: [], cheap: [] },
  };
  for (const { item, result } of outcomes) {
    if (typeof result.raw === "string") summary.fallbacks += 1;
    if (result.scope === item.expected) summary.correct += 1;
    if (item.expected === "injection" && result.scope !== "injection") summary.injectionsMissed += 1;
    if (item.expected !== "injection" && result.scope === "injection") {
      const costly = item.expected === "cv" || item.expected === "contact";
      summary.falseInjections[costly ? "costly" : "cheap"].push(item.id);
    }
  }
  return summary;
}
