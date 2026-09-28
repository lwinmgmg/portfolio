import { EmbeddingError } from "@/server/rag/embedding/embedding-error";

// Scales a vector to unit length, so cosine similarity becomes a plain dot product.
export function l2Normalize(vector: readonly number[]): number[] {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const norm = Math.sqrt(sumOfSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new EmbeddingError("An embedding vector has no direction and cannot be normalized.");
  }
  return vector.map((value) => value / norm);
}
