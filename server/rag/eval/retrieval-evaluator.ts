import {
  RetrievalError,
  type IndexConfig,
  type QueryScope,
  type RagIndex,
  type RetrievalConfig,
  type RetrievalRunner,
  type RetrievalTrace,
  type RetrievedChunk,
} from "@/server/domain/rag";
import {
  unknownEntityKeys,
  type GoldenItem,
  type UnknownKeys,
} from "@/server/rag/eval/golden-set";
import {
  assertCutoffs,
  mean,
  meanMetrics,
  questionMetrics,
  type MeanMetrics,
  type QuestionMetrics,
} from "@/server/rag/eval/metrics";
import {
  isRetrievalPresetName,
  RETRIEVAL_PRESETS,
  type RetrievalPresetName,
} from "@/server/rag/pipeline/retrieval-config";
import { RouteStageOutputSchema, STAGE } from "@/server/rag/pipeline/trace-stages";

// Runs the saved chat config (EvalInput.chatConfig) next to the fixed presets.
export const CHAT_PRESET = "chat";

export type EvalPresetName = RetrievalPresetName | typeof CHAT_PRESET;

export function isEvalPresetName(value: string): value is EvalPresetName {
  return value === CHAT_PRESET || isRetrievalPresetName(value);
}

export type EvalTarget = {
  index: RagIndex;
  // Every entity key the index's chunks carry, to flag golden keys it can never return.
  entityKeys: ReadonlySet<string>;
};

export type EvalInput = {
  items: readonly GoldenItem[];
  targets: readonly EvalTarget[];
  presets: readonly EvalPresetName[];
  // The saved chat config. Required when `presets` includes CHAT_PRESET.
  chatConfig?: RetrievalConfig;
  ks: readonly number[];
  subjectName: string;
  // The tag filter that selected `items`, for the report.
  tags: readonly string[];
};

export type RetrievedSummary = {
  sourceId: string;
  title: string;
  entityKeys: string[];
  relevant: boolean;
  fusedScore: number;
  rerankScore: number | null;
};

export type QuestionResult = {
  itemId: string;
  question: string;
  tags: string[];
  expectedScope: QueryScope;
  // Null when retrieval failed.
  scope: QueryScope | null;
  // Whether the scope router fell back to the rewriter. Null when no route stage ran.
  routerFallback: boolean | null;
  queries: string[];
  retrieved: RetrievedSummary[];
  // A failed run scores 0 everywhere: the visitor would have got no sources. Null for a question
  // that is not about the CV, which has no relevant chunks to find.
  metrics: QuestionMetrics | null;
  totalMs: number;
  // Duration of each recorded stage. Skipped stages are absent.
  stageMs: Record<string, number>;
  error: { stage: string | null; message: string } | null;
};

export type ScopeSummary = {
  // Questions whose final scope matched the golden one. A failed run counts as a miss.
  correct: number;
  // CV questions that skipped retrieval as small talk or off topic: the costly mistake.
  cvSkipped: number;
  routerFallbacks: number;
};

export type RunSummary = {
  questions: number;
  errors: number;
  // Means over the cv questions. Null when the run had none.
  metrics: MeanMetrics | null;
  scope: ScopeSummary;
  meanTotalMs: number;
  // Mean duration of each stage over the questions that ran it.
  meanStageMs: Record<string, number>;
};

export type EvalRun = {
  indexId: string;
  preset: EvalPresetName;
  config: RetrievalConfig;
  summary: RunSummary;
  results: QuestionResult[];
};

export type EvalIndexInfo = {
  id: string;
  sourceId: string;
  config: IndexConfig;
  createdAt: string;
  unknownKeys: UnknownKeys[];
};

export type EvalReport = {
  createdAt: string;
  subjectName: string;
  ks: number[];
  tags: string[];
  items: number;
  indexes: EvalIndexInfo[];
  // Index-major, then preset, in input order.
  runs: EvalRun[];
};

export type EvalProgress = {
  indexId: string;
  preset: EvalPresetName;
  result: QuestionResult;
  done: number;
  total: number;
};

export type RetrievalEvaluatorDeps = {
  runner: RetrievalRunner;
  now?: () => Date;
  onProgress?: (progress: EvalProgress) => void;
};

// Runs every golden question through the pipeline for each index and preset. Questions run one
// at a time, so latencies are not inflated by each other and free-tier rate limits hold.
export class RetrievalEvaluator {
  constructor(private readonly deps: RetrievalEvaluatorDeps) {}

  async evaluate(input: EvalInput): Promise<EvalReport> {
    assertCutoffs(input.ks);
    if (input.items.length === 0) throw new RangeError("No golden items to evaluate.");
    // Checked before any question runs, so a missing chat config never ends a run halfway.
    const presets = input.presets.map((preset) => ({
      preset,
      config: configFor(preset, input.chatConfig),
    }));
    const ks = [...new Set(input.ks)].sort((a, b) => a - b);
    const createdAt = (this.deps.now?.() ?? new Date()).toISOString();
    const total = input.targets.length * input.presets.length * input.items.length;

    let done = 0;
    const runs: EvalRun[] = [];
    for (const { index } of input.targets) {
      for (const { preset, config } of presets) {
        const results: QuestionResult[] = [];
        for (const item of input.items) {
          const result = await this.evaluateItem(item, index.id, config, ks, input.subjectName);
          results.push(result);
          done += 1;
          this.deps.onProgress?.({ indexId: index.id, preset, result, done, total });
        }
        runs.push({
          indexId: index.id,
          preset,
          config: { ...config },
          summary: summarize(results, ks),
          results,
        });
      }
    }

    return {
      createdAt,
      subjectName: input.subjectName,
      ks,
      tags: [...input.tags],
      items: input.items.length,
      indexes: input.targets.map(({ index, entityKeys }) => ({
        id: index.id,
        sourceId: index.sourceId,
        config: { ...index.config },
        createdAt: index.createdAt,
        unknownKeys: unknownEntityKeys(input.items, entityKeys),
      })),
      runs,
    };
  }

  private async evaluateItem(
    item: GoldenItem,
    indexId: string,
    config: RetrievalConfig,
    ks: readonly number[],
    subjectName: string,
  ): Promise<QuestionResult> {
    const base = {
      itemId: item.id,
      question: item.question,
      tags: [...item.tags],
      expectedScope: item.expectedScope,
    };
    const scored = item.expectedScope === "cv";
    try {
      const result = await this.deps.runner.run({
        message: item.question,
        history: item.history,
        config,
        indexId,
        subjectName,
        kind: "eval",
      });
      const relevant = new Set(item.relevantEntityKeys);
      return {
        ...base,
        scope: result.scope,
        routerFallback: routerFallback(result.trace),
        queries: [...result.queries],
        retrieved: result.chunks.map((chunk) => summarizeChunk(chunk, relevant)),
        metrics: scored
          ? questionMetrics(
              result.chunks.map((chunk) => chunk.entityKeys),
              item.relevantEntityKeys,
              ks,
            )
          : null,
        ...timings(result.trace),
        error: null,
      };
    } catch (failure) {
      // Any other error (missing index, bad config) would fail every question alike, so it stops
      // the whole evaluation.
      if (!(failure instanceof RetrievalError)) throw failure;
      // The same stage RetrievalError names; its message only says which stage failed.
      const failed = failure.trace.stages.findLast((stage) => stage.error !== null);
      return {
        ...base,
        scope: null,
        routerFallback: routerFallback(failure.trace),
        queries: [],
        retrieved: [],
        metrics: scored ? questionMetrics([], item.relevantEntityKeys, ks) : null,
        ...timings(failure.trace),
        error: { stage: failure.stage, message: failed?.error ?? failure.message },
      };
    }
  }
}

function configFor(preset: EvalPresetName, chatConfig: RetrievalConfig | undefined): RetrievalConfig {
  if (preset !== CHAT_PRESET) return { ...RETRIEVAL_PRESETS[preset] };
  if (!chatConfig) throw new RangeError(`The "${CHAT_PRESET}" preset needs the saved chat config.`);
  return { ...chatConfig };
}

function summarizeChunk(chunk: RetrievedChunk, relevant: ReadonlySet<string>): RetrievedSummary {
  return {
    sourceId: chunk.sourceId,
    title: chunk.title,
    entityKeys: [...chunk.entityKeys],
    relevant: chunk.entityKeys.some((key) => relevant.has(key)),
    fusedScore: chunk.fusedScore,
    rerankScore: chunk.rerankScore,
  };
}

function routerFallback(trace: RetrievalTrace): boolean | null {
  const stage = trace.stages.find((entry) => entry.name === STAGE.route);
  if (!stage) return null;
  // A route stage that threw has no output; count it as a fallback too.
  const output = RouteStageOutputSchema.safeParse(stage.output);
  return output.success ? output.data.fallback : true;
}

function timings(trace: RetrievalTrace): Pick<QuestionResult, "totalMs" | "stageMs"> {
  const stageMs: Record<string, number> = {};
  for (const stage of trace.stages) {
    stageMs[stage.name] = (stageMs[stage.name] ?? 0) + stage.durationMs;
  }
  return { totalMs: trace.totalMs, stageMs };
}

export function summarize(results: readonly QuestionResult[], ks: readonly number[]): RunSummary {
  const byStage = new Map<string, number[]>();
  for (const result of results) {
    for (const [name, ms] of Object.entries(result.stageMs)) {
      byStage.set(name, [...(byStage.get(name) ?? []), ms]);
    }
  }
  const scored = results.flatMap((result) => (result.metrics ? [result.metrics] : []));
  return {
    questions: results.length,
    errors: results.filter((result) => result.error !== null).length,
    metrics: scored.length > 0 ? meanMetrics(scored, ks) : null,
    scope: {
      correct: results.filter((result) => result.scope === result.expectedScope).length,
      cvSkipped: results.filter(
        (result) => result.expectedScope === "cv" && result.scope !== null && result.scope !== "cv",
      ).length,
      routerFallbacks: results.filter((result) => result.routerFallback === true).length,
    },
    meanTotalMs: mean(results.map((result) => result.totalMs)),
    meanStageMs: Object.fromEntries([...byStage].map(([name, values]) => [name, mean(values)])),
  };
}
