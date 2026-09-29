import type {
  RerankCandidate,
  RerankedHit,
  Reranker,
  RerankOutcome,
} from "@/server/domain/rag";

export function assertTopN(topN: number): void {
  if (!Number.isInteger(topN) || topN < 1) throw new RangeError("topN must be a positive integer.");
}

// The first `topN` candidates in their given order, scored `1 / rank`.
export function passthroughHits(
  candidates: readonly RerankCandidate[],
  topN: number,
): RerankedHit[] {
  assertTopN(topN);
  return candidates
    .slice(0, topN)
    .map((candidate, index) => ({ chunkId: candidate.chunkId, score: 1 / (index + 1) }));
}

// Keeps the fused order. Used when reranking is off and as the API reranker's fallback.
export class PassthroughReranker implements Reranker {
  async rerank(
    _query: string,
    candidates: readonly RerankCandidate[],
    topN: number,
  ): Promise<RerankOutcome> {
    return { hits: passthroughHits(candidates, topN), fallback: false, error: null };
  }
}
