import type { IndexConfig } from "@/server/domain/rag";
import { STAGE } from "@/server/rag/pipeline/trace-stages";
import type {
  EvalReport,
  EvalRun,
  QuestionResult,
} from "@/server/rag/eval/retrieval-evaluator";

const FAILED_TOP_TITLES = 3;

export function indexLabel(index: { id: string; config: IndexConfig }): string {
  const context = index.config.contextualize ? "contextual" : "plain";
  return `${index.config.chunker}, ${context} (${index.id.slice(-6)})`;
}

// Colons are not allowed in Windows file names.
export function reportFileName(createdAt: string): string {
  return `${createdAt.replace(/:/g, "-")}.json`;
}

// The largest cutoff, used for the recall column and to call a question failed.
function deepestK(report: EvalReport): number {
  return Math.max(...report.ks);
}

// CV questions with no relevant chunk in the top k.
export function failedQuestions(run: EvalRun, k: number): QuestionResult[] {
  return run.results.filter((result) => result.metrics?.hitAt[k] === 0);
}

// Questions whose final scope differs from the golden one, failed runs included.
export function misroutedQuestions(run: EvalRun): QuestionResult[] {
  return run.results.filter((result) => result.scope !== result.expectedScope);
}

const metric = (value: number | undefined) => (value === undefined ? "—" : value.toFixed(3));
const millis = (value: number | undefined) => (value === undefined ? "—" : String(Math.round(value)));
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function renderEvalMarkdown(report: EvalReport): string {
  const k = deepestK(report);
  const labels = new Map(report.indexes.map((index) => [index.id, indexLabel(index)]));
  const label = (indexId: string) => labels.get(indexId) ?? indexId;
  const lines: string[] = [`# Retrieval eval, ${report.createdAt}`, ""];

  const finalKs = [...new Set(report.runs.map((run) => run.config.finalK))].sort((a, b) => a - b);
  const tags = report.tags.length > 0 ? ` tagged ${report.tags.join(", ")}` : "";
  lines.push(
    `${report.items} questions${tags} for ${report.subjectName}. Metrics use each preset's final ` +
      `chunks (finalK ${finalKs.join(", ")}); a relevant chunk ranked below finalK counts as missed.`,
    "",
    "Indexes:",
    ...report.indexes.map(
      (index) =>
        `- ${label(index.id)}: \`${index.id}\`, embeddings ${index.config.embeddingModel}` +
        (index.config.contextModel ? `, context ${index.config.contextModel}` : "") +
        `, built ${index.createdAt}`,
    ),
    "",
  );

  const hitColumns = report.ks.map((cutoff) => `hit@${cutoff}`);
  const header = [
    "Index",
    "Preset",
    ...hitColumns,
    `recall@${k}`,
    "MRR",
    "scope acc",
    "cv skipped",
    "router fallbacks",
    "mean total ms",
    "mean rerank ms",
    "errors",
  ];
  lines.push(
    `| ${header.join(" | ")} |`,
    `|${header.map((_, column) => (column < 2 ? "---" : "---:")).join("|")}|`,
    ...report.runs.map((run) => {
      const { metrics, scope, questions, meanTotalMs, meanStageMs, errors } = run.summary;
      const cvQuestions = run.results.filter((result) => result.expectedScope === "cv").length;
      const cells = [
        label(run.indexId),
        run.preset,
        ...report.ks.map((cutoff) => metric(metrics?.hitAt[cutoff])),
        metric(metrics?.recallAt[k]),
        metric(metrics?.reciprocalRank),
        metric(scope.correct / questions),
        `${scope.cvSkipped}/${cvQuestions}`,
        String(scope.routerFallbacks),
        millis(meanTotalMs),
        millis(meanStageMs[STAGE.rerank]),
        String(errors),
      ];
      return `| ${cells.join(" | ")} |`;
    }),
    "",
  );

  lines.push(`## Failed questions (hit@${k} = 0)`, "");
  const failedRuns = report.runs
    .map((run) => ({ run, failed: failedQuestions(run, k) }))
    .filter(({ failed }) => failed.length > 0);
  if (failedRuns.length === 0) lines.push("None.", "");
  for (const { run, failed } of failedRuns) {
    lines.push(`### ${label(run.indexId)} · ${run.preset}`, "");
    lines.push(...failed.map((result) => `- \`${result.itemId}\` ${oneLine(result.question)} → ${outcome(result)}`));
    lines.push("");
  }

  lines.push("## Scope mismatches", "");
  const misroutedRuns = report.runs
    .map((run) => ({ run, misrouted: misroutedQuestions(run) }))
    .filter(({ misrouted }) => misrouted.length > 0);
  if (misroutedRuns.length === 0) lines.push("None.", "");
  for (const { run, misrouted } of misroutedRuns) {
    lines.push(`### ${label(run.indexId)} · ${run.preset}`, "");
    lines.push(
      ...misrouted.map(
        (result) =>
          `- \`${result.itemId}\` ${oneLine(result.question)} → expected ${result.expectedScope}, ` +
          `got ${result.scope ?? "an error"}`,
      ),
    );
    lines.push("");
  }

  const unknown = report.indexes.filter((index) => index.unknownKeys.length > 0);
  if (unknown.length > 0) {
    lines.push("## Relevant keys missing from the index", "");
    for (const index of unknown) {
      lines.push(
        ...index.unknownKeys.map(
          (entry) => `- ${label(index.id)}: \`${entry.itemId}\` ${entry.keys.join(", ")}`,
        ),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function outcome(result: QuestionResult): string {
  if (result.error) {
    const where = result.error.stage ? ` at ${result.error.stage}` : "";
    return `error${where}: ${oneLine(result.error.message)}`;
  }
  if (result.retrieved.length === 0) return `no chunks (scope ${result.scope ?? "unknown"})`;
  return result.retrieved
    .slice(0, FAILED_TOP_TITLES)
    .map((chunk) => chunk.title)
    .join("; ");
}
