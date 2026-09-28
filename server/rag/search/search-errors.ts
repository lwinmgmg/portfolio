import { RagError } from "@/server/domain/rag";

// Vectors of different sizes cannot be compared, e.g. a query embedded with another model.
export class VectorDimensionError extends RagError {
  constructor(expected: number, actual: number) {
    super(`Expected a vector with ${expected} dimensions, got ${actual}.`);
    this.name = "VectorDimensionError";
  }
}

// The index has no stored chunks: it does not exist, was deleted, or is still building.
export class EmptySearchIndexError extends RagError {
  readonly indexId: string;

  constructor(indexId: string) {
    super(`RAG index "${indexId}" has no chunks to search.`);
    this.name = "EmptySearchIndexError";
    this.indexId = indexId;
  }
}
