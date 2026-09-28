import type { RankedHit } from "@/server/domain/rag";
import { l2Normalize } from "@/server/rag/embedding/l2-normalize";
import { assertTopK, topRankedHits } from "@/server/rag/search/ranked-hits";
import { VectorDimensionError } from "@/server/rag/search/search-errors";

export type VectorItem = { id: string; vector: readonly number[] };

// Exact nearest-neighbour search by cosine similarity. Stored and query vectors are both
// L2-normalized, so the score is a plain dot product in [-1, 1].
export class VectorIndex {
  // Null for an empty index.
  readonly dimension: number | null;
  private readonly ids: string[];
  private readonly vectors: number[][];

  constructor(items: readonly VectorItem[]) {
    this.dimension = items.length === 0 ? null : items[0].vector.length;
    for (const item of items) this.assertDimension(item.vector);
    this.ids = items.map((item) => item.id);
    // The index builder already stores unit vectors; normalizing again keeps scores true cosines
    // for vectors from anywhere else.
    this.vectors = items.map((item) => l2Normalize(item.vector));
  }

  get size(): number {
    return this.ids.length;
  }

  search(queryVector: readonly number[], k: number): RankedHit[] {
    assertTopK(k);
    if (this.dimension === null) return [];
    this.assertDimension(queryVector);
    const query = l2Normalize(queryVector);
    return topRankedHits(
      this.vectors.map((vector, index) => ({ chunkId: this.ids[index], score: dot(vector, query) })),
      k,
    );
  }

  private assertDimension(vector: readonly number[]): void {
    if (vector.length !== this.dimension) {
      throw new VectorDimensionError(this.dimension ?? 0, vector.length);
    }
  }
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
}
