// Go/no-go probe for scope routing (Plan.md 2.14 step 2). Sends each labelled message in the probe
// file to the decision model and prints its probabilities, then accuracy per cutoff. No database.
// With --rewriter (Plan.md 2.15 step 2) it probes the query rewriter on LLM_UTILITY_MODEL instead
// and prints its scope per item, with injection detection totals.
// Usage: bun --env-file=.env.local scripts/probe-scope-router.ts [--file <path>] [--model <slug>] [--rewriter]
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { LlmProviderError } from "../server/domain/llm";
import { AdaptiveChatClient } from "../server/llm/adaptive-chat-client";
import { readLlmEnv } from "../server/llm/llm-env";
import { OpenRouterClient } from "../server/llm/openrouter-client";
import { LlmQueryRewriter } from "../server/rag/query/llm-query-rewriter";
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
  summarizeRewriter,
  type ProbeItem,
  type ProbeOutcome,
  type RewriterOutcome,
} from "../server/rag/route/scope-probe";

const DEFAULT_FILE = "evals/scope-probe.json";

class ProbeSetupError extends Error {}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      model: { type: "string" },
      rewriter: { type: "boolean", default: false },
    },
    strict: true,
  });
  const env = readLlmEnv();
  if (!env) throw new ProbeSetupError("OpenRouter is not configured. Set OPENROUTER_API_KEY in .env.local.");
  const set = parseProbeSet(JSON.parse(await readFile(values.file ?? DEFAULT_FILE, "utf8")));
  if (values.rewriter) {
    await probeRewriter(env, values.model ?? env.LLM_UTILITY_MODEL, set.subject, set.items);
    return;
  }
  const model = values.model ?? env.LLM_ROUTER_MODEL;
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
    `Items: ${set.items.length} (cv ${counts.cv}, smalltalk ${counts.smalltalk}, off_topic ${counts.off_topic}, ` +
      `contact ${counts.contact}, injection ${counts.injection}), timeout ${ROUTE_TIMEOUT_MS} ms, one attempt each\n`,
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

  console.log(
    "\nAt each cutoff (correct = cv, contact and injection deferred, or small talk / off topic " +
      "short-circuited to the right scope; cv skipped counts cv and contact items):",
  );
  console.log(
    row(["cutoff", "correct", "accuracy", "cv skipped", "missed", "wrong scope", "inj answered"], CUTOFF_WIDTHS),
  );
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
        String(summary.injectionsShortCircuited),
      ], CUTOFF_WIDTHS),
    );
  }
}

// The rewriter as `createRag` wires it: LlmQueryRewriter in `standalone` mode on the utility
// model, through AdaptiveChatClient. Its own client keeps the default timeout and retries.
async function probeRewriter(
  env: NonNullable<ReturnType<typeof readLlmEnv>>,
  model: string,
  subjectName: string,
  items: readonly ProbeItem[],
): Promise<void> {
  const chat = new AdaptiveChatClient(
    new OpenRouterClient({
      apiKey: env.OPENROUTER_API_KEY,
      appUrl: env.OPENROUTER_APP_URL,
      appName: env.OPENROUTER_APP_NAME,
    }),
  );
  const rewriter = new LlmQueryRewriter(chat, model);
  console.log(`Rewriter model: ${model}, ${items.length} items, mode standalone\n`);
  console.log(row(["id", "expected", "scope", "ms", "note"], REWRITER_WIDTHS));

  const outcomes: RewriterOutcome[] = [];
  // Sequential on purpose: free models have tight rate limits.
  for (const item of items) {
    const started = performance.now();
    const result = await rewriter.rewrite({
      message: item.message,
      history: item.history,
      mode: "standalone",
      subjectName,
    });
    const latencyMs = Math.round(performance.now() - started);
    outcomes.push({ item, result, latencyMs });
    const note = typeof result.raw === "string" ? `fallback: ${result.raw}` : result.scope === item.expected ? "" : "MISMATCH";
    console.log(row([item.id, item.expected, result.scope, String(latencyMs), note], REWRITER_WIDTHS));
  }

  const summary = summarizeRewriter(outcomes);
  const injections = outcomes.filter(({ item }) => item.expected === "injection").length;
  console.log(`\nScope matches the label: ${summary.correct}/${summary.total}`);
  console.log(`Fallbacks (rewriter failed, scope defaulted to cv): ${summary.fallbacks}/${summary.total}`);
  console.log(`Injections missed: ${summary.injectionsMissed}/${injections}`);
  console.log(`False injections, costly (cv or contact item): ${listOrNone(summary.falseInjections.costly)}`);
  console.log(`False injections, cheap (other items): ${listOrNone(summary.falseInjections.cheap)}`);
}

function listOrNone(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : `${ids.length} (${ids.join(", ")})`;
}

function describeError(error: unknown): string {
  if (error instanceof LlmProviderError) {
    return error.status === null ? error.message : `${error.status} ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

const ITEM_WIDTHS = [32, 10, 10, 6, 6, 6, 6];
const REWRITER_WIDTHS = [32, 10, 10, 6];
const CUTOFF_WIDTHS = [7, 8, 9, 11, 7, 12];

function row(cells: string[], widths: readonly number[] = ITEM_WIDTHS): string {
  return cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(" ").trimEnd();
}

main().catch((error: unknown) => {
  const forTheReader =
    error instanceof ProbeSetupError || error instanceof ProbeSetError || error instanceof SyntaxError;
  console.error(forTheReader ? error.message : error);
  process.exit(1);
});
