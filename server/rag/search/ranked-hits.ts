import type { RankedHit } from "@/server/domain/rag";

export type ScoredChunk = { chunkId: string; score: number };

export function assertTopK(k: number): void {
  if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be a positive integer.");
}

// The `k` best scores, highest first, with 1-based ranks. Ties keep the input order, so results
// are deterministic when the input is in document order.
export function topRankedHits(scored: readonly ScoredChunk[], k: number): RankedHit[] {
  assertTopK(k);
  return [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((hit, index) => ({ chunkId: hit.chunkId, rank: index + 1, score: hit.score }));
}
