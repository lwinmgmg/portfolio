// Rough token count for English text (about 4 characters per token). Chunk sizing and index
// stats only need a stable, model-independent estimate, not the embedding model's tokenizer.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
