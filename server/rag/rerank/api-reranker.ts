import type { RerankClient, RerankResult } from "@/server/domain/llm";
import type {
  RerankCandidate,
  RerankedHit,
  Reranker,
  RerankOutcome,
} from "@/server/domain/rag";
import { assertTopN, passthroughHits } from "@/server/rag/rerank/passthrough-reranker";
import { RerankError } from "@/server/rag/rerank/rerank-error";

// Reranking sits on the chat path, so a slow provider falls back quickly. Retries included.
export const RERANK_TIMEOUT_MS = 15_000;

export type ApiRerankerOptions = {
  timeoutMs?: number;
};

// Scores each candidate against the query with a cross-encoder model. Any failure keeps the
// candidate order (passthrough) and reports `fallback: true` for the trace.
export class ApiReranker implements Reranker {
  private readonly timeoutMs: number;

  constructor(
    private readonly client: RerankClient,
    private readonly model: string,
    options: ApiRerankerOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? RERANK_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new RangeError("timeoutMs must be a positive integer.");
    }
  }

  async rerank(
    query: string,
    candidates: readonly RerankCandidate[],
    topN: number,
  ): Promise<RerankOutcome> {
    assertTopN(topN);
    if (candidates.length === 0) return { hits: [], fallback: false, error: null };

    try {
      const results = await this.client.rerank({
        model: this.model,
        query,
        documents: candidates.map((candidate) => candidate.text),
        // Some providers reject a top_n larger than the document count.
        topN: Math.min(topN, candidates.length),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { hits: toHits(results, candidates, topN), fallback: false, error: null };
    } catch (error) {
      return {
        hits: passthroughHits(candidates, topN),
        fallback: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Maps result indices back to chunk ids, best score first. Ties keep the candidate order.
function toHits(
  results: readonly RerankResult[],
  candidates: readonly RerankCandidate[],
  topN: number,
): RerankedHit[] {
  const seen = new Set<number>();
  for (const result of results) {
    if (!Number.isInteger(result.index) || result.index < 0 || result.index >= candidates.length) {
      throw new RerankError(
        `Rerank result index ${result.index} is outside the ${candidates.length} documents sent.`,
      );
    }
    if (seen.has(result.index)) {
      throw new RerankError(`Rerank results list document ${result.index} twice.`);
    }
    seen.add(result.index);
  }

  return [...results]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topN)
    .map((result) => ({ chunkId: chunkIdAt(candidates, result.index), score: result.score }));
}

function chunkIdAt(candidates: readonly RerankCandidate[], index: number): string {
  const candidate = candidates[index];
  if (!candidate) throw new RerankError(`No candidate at index ${index}.`);
  return candidate.chunkId;
}
