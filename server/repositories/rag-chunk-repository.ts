import "server-only";

import type { ObjectId, WithId } from "mongodb";

import type {
  EmbeddedChunk,
  NewEmbeddedChunk,
  RagChunkRepository,
} from "@/server/domain/rag";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type RagChunkDocument = {
  indexId: ObjectId;
  ordinal: number;
  section: string;
  title: string;
  entityKeys: string[];
  text: string;
  context: string | null;
  indexText: string;
  tokenCount: number;
  // Stored as a plain number array so an Atlas vector index can use it later.
  embedding: number[];
};

export class MongoRagChunkRepository
  extends MongoRepository<EmbeddedChunk, RagChunkDocument>
  implements RagChunkRepository
{
  constructor() {
    super("rag_chunks");
  }

  protected toEntity(document: WithId<RagChunkDocument>): EmbeddedChunk {
    return {
      id: document._id.toHexString(),
      indexId: document.indexId.toHexString(),
      ordinal: document.ordinal,
      section: document.section,
      title: document.title,
      entityKeys: [...document.entityKeys],
      text: document.text,
      context: document.context,
      indexText: document.indexText,
      tokenCount: document.tokenCount,
      embedding: [...document.embedding],
    };
  }

  protected override createIndexes(): Promise<unknown> {
    return this.collection().createIndex({ indexId: 1, ordinal: 1 });
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async insertMany(chunks: NewEmbeddedChunk[], indexId: string): Promise<number> {
    await this.ensureReady();
    const objectId = this.requireIndexId(indexId);
    if (chunks.length === 0) return 0;
    const documents = chunks.map(
      (chunk): RagChunkDocument => ({
        indexId: objectId,
        ordinal: chunk.ordinal,
        section: chunk.section,
        title: chunk.title,
        entityKeys: [...chunk.entityKeys],
        text: chunk.text,
        context: chunk.context,
        indexText: chunk.indexText,
        tokenCount: chunk.tokenCount,
        embedding: [...chunk.embedding],
      }),
    );
    const result = await this.collection().insertMany(documents);
    return result.insertedCount;
  }

  async listByIndex(indexId: string): Promise<EmbeddedChunk[]> {
    await this.ensureReady();
    const objectId = this.parseId(indexId);
    if (!objectId) return [];
    const documents = await this.collection()
      .find({ indexId: objectId })
      .sort({ ordinal: 1 })
      .toArray();
    return documents.map((document) => this.toEntity(document));
  }

  async deleteByIndex(indexId: string): Promise<number> {
    await this.ensureReady();
    const objectId = this.parseId(indexId);
    if (!objectId) return 0;
    const result = await this.collection().deleteMany({ indexId: objectId });
    return result.deletedCount;
  }

  // Writing chunks under an invalid id would orphan them, so this is an error, not a no-op.
  private requireIndexId(indexId: string): ObjectId {
    const objectId = this.parseId(indexId);
    if (!objectId) throw new Error(`Invalid RAG index id "${indexId}".`);
    return objectId;
  }
}
