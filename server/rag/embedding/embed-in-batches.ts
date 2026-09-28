import type { EmbeddingClient } from "@/server/domain/llm";
import { EmbeddingError } from "@/server/rag/embedding/embedding-error";

export const EMBEDDING_BATCH_SIZE = 64;

// Embeds `texts` in sequential batches and returns one vector per text, in order.
// Every vector must be finite and share one dimension, or the index could not compare them.
export async function embedInBatches(
  client: EmbeddingClient,
  model: string,
  texts: readonly string[],
  batchSize = EMBEDDING_BATCH_SIZE,
): Promise<number[][]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer.");
  }

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const result = await client.embed({ model, texts: batch });
    if (result.vectors.length !== batch.length) {
      throw new EmbeddingError(
        `The embedding model returned ${result.vectors.length} vectors for ${batch.length} texts.`,
      );
    }
    vectors.push(...result.vectors);
  }

  const dimension = vectors[0]?.length ?? 0;
  for (const vector of vectors) {
    if (vector.length === 0 || vector.length !== dimension) {
      throw new EmbeddingError("The embedding model returned vectors of different sizes.");
    }
    if (!vector.every(Number.isFinite)) {
      throw new EmbeddingError("The embedding model returned a vector with invalid numbers.");
    }
  }
  return vectors;
}
