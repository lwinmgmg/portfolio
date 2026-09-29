import type { StageTiming } from "@/server/rag/pipeline/trace-reader";

// In-memory search stages take fractions of a millisecond, so short times keep a decimal.
export function formatMs(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// Cosine, BM25, RRF and rerank scores all read well at four decimals.
export function formatScore(score: number | null): string {
  return score === null ? "—" : score.toFixed(4);
}

// `vector:q0#3, bm25:q0#1`
export function contributionLabel(contributions: readonly { list: string; rank: number }[]): string {
  return contributions.map((entry) => `${entry.list}#${entry.rank}`).join(", ");
}

export type TimingBar = { leftPercent: number; widthPercent: number };

// Keeps a sub-millisecond stage visible next to a multi-second one.
const MIN_BAR_PERCENT = 0.5;

// Places each stage on a 0..100 axis of the whole trace.
export function timingBar(stage: Pick<StageTiming, "startedAt" | "durationMs">, totalMs: number): TimingBar {
  if (!(totalMs > 0)) return { leftPercent: 0, widthPercent: MIN_BAR_PERCENT };
  const left = clampPercent((stage.startedAt / totalMs) * 100);
  const width = Math.max(MIN_BAR_PERCENT, clampPercent((stage.durationMs / totalMs) * 100));
  return { leftPercent: left, widthPercent: Math.min(width, 100 - left) || MIN_BAR_PERCENT };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
