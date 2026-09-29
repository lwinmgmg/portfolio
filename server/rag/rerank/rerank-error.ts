import { RagError } from "@/server/domain/rag";

// The rerank API answered, but its results do not match the documents that were sent.
export class RerankError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "RerankError";
  }
}
