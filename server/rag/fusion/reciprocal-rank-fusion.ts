import type { FusedHit, NamedHitList } from "@/server/domain/rag";

type Accumulator = {
  chunkId: string;
  ranks: number[];
  contributions: { list: string; rank: number }[];
};

// Reciprocal Rank Fusion: each list a chunk appears in adds `1 / (k + rank)`. Only ranks count,
// so lists with incomparable scores (cosine, BM25) can be merged. Returns every chunk, best first;
// ties go to the better single rank, then the smaller chunk id.
export function reciprocalRankFusion(lists: readonly NamedHitList[], k: number): FusedHit[] {
  if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be a positive integer.");

  const byChunk = new Map<string, Accumulator>();
  for (const list of lists) {
    // A chunk listed twice in one list counts once, at its first (best) rank.
    const seen = new Set<string>();
    for (const hit of list.hits) {
      if (!Number.isInteger(hit.rank) || hit.rank < 1) {
        throw new RangeError(`List "${list.name}" has an invalid rank ${hit.rank}.`);
      }
      if (seen.has(hit.chunkId)) continue;
      seen.add(hit.chunkId);

      let entry = byChunk.get(hit.chunkId);
      if (!entry) {
        entry = { chunkId: hit.chunkId, ranks: [], contributions: [] };
        byChunk.set(hit.chunkId, entry);
      }
      entry.ranks.push(hit.rank);
      entry.contributions.push({ list: list.name, rank: hit.rank });
    }
  }

  return [...byChunk.values()]
    .map((entry) => {
      // Summing in rank order makes equal rank sets score bit-for-bit equal, whatever the list order.
      const ranks = [...entry.ranks].sort((a, b) => a - b);
      return {
        hit: {
          chunkId: entry.chunkId,
          score: ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0),
          contributions: entry.contributions,
        },
        bestRank: ranks[0] ?? Number.POSITIVE_INFINITY,
      };
    })
    .sort(
      (a, b) =>
        b.hit.score - a.hit.score ||
        a.bestRank - b.bestRank ||
        compareIds(a.hit.chunkId, b.hit.chunkId),
    )
    .map(({ hit }) => hit);
}

// Code-unit order, so the result does not depend on the runtime locale.
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
