import { RagError } from "@/server/domain/rag";

// The corpus does not have the shape a chunker relies on, e.g. an entity missing from the markdown.
export class ChunkingError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "ChunkingError";
  }
}
