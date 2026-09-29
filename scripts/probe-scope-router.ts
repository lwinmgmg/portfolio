// Go/no-go probe for scope routing (Plan.md 2.14 step 2). Sends each labelled message in the probe
// file to the decision model and prints its probabilities, then accuracy per cutoff. No database.
// Usage: bun --env-file=.env.local scripts/probe-scope-router.ts [--file <path>] [--model <slug>]
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { LlmProviderError } from "../server/domain/llm";
import { readLlmEnv } from "../server/llm/llm-env";
import { OpenRouterClient } from "../server/llm/openrouter-client";
import {
  buildRouteQuestion,
  buildRouteState,
  readScopeAnswer,
  ROUTE_QUESTION_KEY,
  ROUTE_TIMEOUT_MS,
  type ScopeReading,
} from "../server/rag/route/route-question";
import {
  expectedScopes,
  parseProbeSet,
  PROBE_CUTOFFS,
  probeTotals,
  ProbeSetError,
  summarizeCutoff,
  type ProbeOutcome,
} from "../server/rag/route/scope-probe";

const DEFAULT_FILE = "evals/scope-probe.json";

class ProbeSetupError extends Error {}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { file: { type: "string" }, model: { type: "string" } },
    strict: true,
  });
  const env = readLlmEnv();
  if (!env) throw new ProbeSetupError("OpenRouter is not configured. Set OPENROUTER_API_KEY in .env.local.");
  const model = values.model ?? env.LLM_ROUTER_MODEL;
  const set = parseProbeSet(JSON.parse(await readFile(values.file ?? DEFAULT_FILE, "utf8")));
  const client = new OpenRouterClient({
    apiKey: env.OPENROUTER_API_KEY,
    appUrl: env.OPENROUTER_APP_URL,
    appName: env.OPENROUTER_APP_NAME,
    timeoutMs: ROUTE_TIMEOUT_MS,
  });
  const question = buildRouteQuestion(set.subject);
  const counts = expectedScopes(set);

  console.log(`Model: ${model}`);
  console.log(
    `Items: ${set.items.length} (cv ${counts.cv}, smalltalk ${counts.smalltalk}, off_topic ${counts.off_topic}), ` +
      `timeout ${ROUTE_TIMEOUT_MS} ms, one attempt each\n`,
  );
  console.log(row(["id", "expected", "choice", "cv", "small", "off", "ms", "error"]));

  const outcomes: ProbeOutcome[] = [];
  const servedModels = new Set<string>();
  // Sequential on purpose: free decision models have tight rate limits.
  for (const item of set.items) {
    const started = performance.now();
    let reading: ScopeReading;
    try {
      const result = await client.decide({
        model,
        state: buildRouteState({ message: item.message, history: item.history, subjectName: set.subject }),
        questions: { [ROUTE_QUESTION_KEY]: question },
        signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
      });
      servedModels.add(result.model);
      reading = readScopeAnswer(result.answers[ROUTE_QUESTION_KEY]);
    } catch (error) {
      reading = { ok: false, error: describeError(error) };
    }
    const latencyMs = Math.round(performance.now() - started);
    outcomes.push({ item, reading, latencyMs });
    console.log(
      row([
        item.id,
        item.expected,
        reading.ok ? reading.choice : "-",
        reading.ok ? reading.probabilities.cv.toFixed(2) : "-",
        reading.ok ? reading.probabilities.smalltalk.toFixed(2) : "-",
        reading.ok ? reading.probabilities.off_topic.toFixed(2) : "-",
        String(latencyMs),
        reading.ok ? "" : reading.error,
      ]),
    );
  }

  const totals = probeTotals(outcomes);
  console.log(`\nServed by: ${servedModels.size > 0 ? [...servedModels].join(", ") : "(no answer)"}`);
  console.log(`Errors: ${totals.errors}/${totals.total}`);
  console.log(`Top choice matches the label: ${totals.choiceMatches}/${totals.total}`);
  if (totals.latencyMs) {
    console.log(`Latency of answered calls: median ${totals.latencyMs.median} ms, max ${totals.latencyMs.max} ms`);
  }

  console.log("\nAt each cutoff (correct = cv deferred, or small talk / off topic short-circuited to the right scope):");
  console.log(row(["cutoff", "correct", "accuracy", "cv skipped", "missed", "wrong scope"], CUTOFF_WIDTHS));
  for (const cutoff of PROBE_CUTOFFS) {
    const summary = summarizeCutoff(outcomes, cutoff);
    console.log(
      row([
        cutoff.toFixed(2),
        `${summary.correct}/${summary.total}`,
        `${Math.round((summary.correct / summary.total) * 100)}%`,
        `${summary.cvSkipped}/${summary.cvTotal}`,
        String(summary.missedShortCircuits),
        String(summary.wrongShortCircuits),
      ], CUTOFF_WIDTHS),
    );
  }
}

function describeError(error: unknown): string {
  if (error instanceof LlmProviderError) {
    return error.status === null ? error.message : `${error.status} ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

const ITEM_WIDTHS = [22, 10, 10, 6, 6, 6, 6];
const CUTOFF_WIDTHS = [7, 8, 9, 11, 7];

function row(cells: string[], widths: readonly number[] = ITEM_WIDTHS): string {
  return cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(" ").trimEnd();
}

main().catch((error: unknown) => {
  const forTheReader =
    error instanceof ProbeSetupError || error instanceof ProbeSetError || error instanceof SyntaxError;
  console.error(forTheReader ? error.message : error);
  process.exit(1);
});
