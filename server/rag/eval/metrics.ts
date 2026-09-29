// Retrieval metrics over entity keys. A ranking is the `entityKeys` of each retrieved chunk,
// best first, and a chunk is relevant when any of its keys is a relevant key.

export type Ranking = readonly (readonly string[])[];

// A relevant chunk ranked below this counts as not found for the reciprocal rank.
export const RECIPROCAL_RANK_DEPTH = 10;

export type QuestionMetrics = {
  // 1 when a relevant chunk is in the top k, else 0. Keyed by k.
  hitAt: Record<number, number>;
  // Share of the distinct relevant keys that the top k chunks carry. Keyed by k.
  recallAt: Record<number, number>;
  // 1 / rank of the first relevant chunk, 0 when none is within RECIPROCAL_RANK_DEPTH.
  reciprocalRank: number;
};

// Means over questions; `reciprocalRank` is the MRR.
export type MeanMetrics = QuestionMetrics;

export function assertCutoffs(ks: readonly number[]): void {
  if (ks.length === 0) throw new RangeError("Give at least one cutoff k.");
  for (const k of ks) {
    if (!Number.isInteger(k) || k < 1) {
      throw new RangeError(`Cutoff k must be a positive integer, got ${k}.`);
    }
  }
}

function isRelevant(keys: readonly string[], relevant: ReadonlySet<string>): boolean {
  return keys.some((key) => relevant.has(key));
}

// 1-based rank of the first relevant chunk, or null.
export function firstRelevantRank(
  ranking: Ranking,
  relevantKeys: readonly string[],
): number | null {
  const relevant = new Set(relevantKeys);
  const index = ranking.findIndex((keys) => isRelevant(keys, relevant));
  return index === -1 ? null : index + 1;
}

export function hitAtK(ranking: Ranking, relevantKeys: readonly string[], k: number): number {
  const rank = firstRelevantRank(ranking, relevantKeys);
  return rank !== null && rank <= k ? 1 : 0;
}

export function recallAtK(ranking: Ranking, relevantKeys: readonly string[], k: number): number {
  const relevant = new Set(relevantKeys);
  if (relevant.size === 0) return 0;
  const covered = new Set(ranking.slice(0, k).flat().filter((key) => relevant.has(key)));
  return covered.size / relevant.size;
}

export function reciprocalRank(ranking: Ranking, relevantKeys: readonly string[]): number {
  const rank = firstRelevantRank(ranking, relevantKeys);
  return rank !== null && rank <= RECIPROCAL_RANK_DEPTH ? 1 / rank : 0;
}

export function questionMetrics(
  ranking: Ranking,
  relevantKeys: readonly string[],
  ks: readonly number[],
): QuestionMetrics {
  assertCutoffs(ks);
  return {
    hitAt: Object.fromEntries(ks.map((k) => [k, hitAtK(ranking, relevantKeys, k)])),
    recallAt: Object.fromEntries(ks.map((k) => [k, recallAtK(ranking, relevantKeys, k)])),
    reciprocalRank: reciprocalRank(ranking, relevantKeys),
  };
}

// NaN for an empty list.
export function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Every entry must have been computed with the same `ks`.
export function meanMetrics(all: readonly QuestionMetrics[], ks: readonly number[]): MeanMetrics {
  assertCutoffs(ks);
  if (all.length === 0) throw new RangeError("No question metrics to average.");
  const at = (pick: (entry: QuestionMetrics) => Record<number, number>, k: number) =>
    mean(
      all.map((entry) => {
        const value = pick(entry)[k];
        if (value === undefined) throw new RangeError(`A question has no metric for k = ${k}.`);
        return value;
      }),
    );
  return {
    hitAt: Object.fromEntries(ks.map((k) => [k, at((entry) => entry.hitAt, k)])),
    recallAt: Object.fromEntries(ks.map((k) => [k, at((entry) => entry.recallAt, k)])),
    reciprocalRank: mean(all.map((entry) => entry.reciprocalRank)),
  };
}
