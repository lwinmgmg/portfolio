import { RagError } from "@/server/domain/rag";

// The embedding provider returned vectors that cannot be indexed.
export class EmbeddingError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}
