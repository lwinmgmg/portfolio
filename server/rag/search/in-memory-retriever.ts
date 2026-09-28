import type {
  Chunk,
  EmbeddedChunk,
  RagChunkRepository,
  RankedHit,
  Retriever,
  TextAnalyzer,
} from "@/server/domain/rag";
import { Bm25Index, type Bm25Options } from "@/server/rag/search/bm25-index";
import { EnglishTextAnalyzer } from "@/server/rag/search/english-text-analyzer";
import { LruCache } from "@/server/rag/search/lru-cache";
import { EmptySearchIndexError } from "@/server/rag/search/search-errors";
import { VectorIndex } from "@/server/rag/search/vector-index";

export const SEARCH_INDEX_CACHE_SIZE = 3;

// Everything needed to search one stored RAG index, built once from its chunks.
export type LoadedSearchIndex = {
  indexId: string;
  lexical: Bm25Index;
  vector: VectorIndex;
  // Chunks without their embeddings, by chunk id.
  chunks: ReadonlyMap<string, Chunk>;
};

// Holds the load promise, so concurrent searches of a cold index share one database read.
export type SearchIndexCache = LruCache<string, Promise<LoadedSearchIndex>>;

export function createSearchIndexCache(capacity = SEARCH_INDEX_CACHE_SIZE): SearchIndexCache {
  return new LruCache(capacity);
}

const globalForSearch = globalThis as unknown as {
  ragSearchIndexCache?: SearchIndexCache;
};

// One cache per process. globalThis keeps loaded indexes across dev hot reloads, like the
// Mongo client in server/db/client.ts.
export function sharedSearchIndexCache(): SearchIndexCache {
  globalForSearch.ragSearchIndexCache ??= createSearchIndexCache();
  return globalForSearch.ragSearchIndexCache;
}

export type InMemoryRetrieverOptions = {
  analyzer?: TextAnalyzer;
  bm25?: Bm25Options;
  // Retrievers that share a cache must use the same analyzer and BM25 options.
  cache?: SearchIndexCache;
};

// Loads an index's chunks from the repository and searches them in memory. A ready index never
// changes, so a loaded index stays valid until it is evicted.
export class InMemoryRetriever implements Retriever {
  private readonly analyzer: TextAnalyzer;
  private readonly bm25: Bm25Options;
  private readonly cache: SearchIndexCache;

  constructor(
    private readonly chunks: Pick<RagChunkRepository, "listByIndex">,
    options: InMemoryRetrieverOptions = {},
  ) {
    this.analyzer = options.analyzer ?? new EnglishTextAnalyzer();
    this.bm25 = options.bm25 ?? {};
    this.cache = options.cache ?? createSearchIndexCache();
  }

  // A failed load is not cached, so the next call reads the index again.
  load(indexId: string): Promise<LoadedSearchIndex> {
    const cached = this.cache.get(indexId);
    if (cached) return cached;

    const loading = this.read(indexId);
    this.cache.set(indexId, loading);
    loading.catch(() => {
      if (this.cache.peek(indexId) === loading) this.cache.delete(indexId);
    });
    return loading;
  }

  async searchLexical(indexId: string, query: string, k: number): Promise<RankedHit[]> {
    return (await this.load(indexId)).lexical.search(query, k);
  }

  async searchVector(indexId: string, vector: readonly number[], k: number): Promise<RankedHit[]> {
    return (await this.load(indexId)).vector.search(vector, k);
  }

  async getChunks(indexId: string, ids: readonly string[]): Promise<Chunk[]> {
    const { chunks } = await this.load(indexId);
    // Copies, so a caller cannot change the cached chunks.
    return ids.flatMap((id) => {
      const chunk = chunks.get(id);
      return chunk ? [copyChunk(chunk)] : [];
    });
  }

  private async read(indexId: string): Promise<LoadedSearchIndex> {
    const rows = await this.chunks.listByIndex(indexId);
    if (rows.length === 0) throw new EmptySearchIndexError(indexId);

    const chunks = new Map(rows.map((row) => [row.id, withoutEmbedding(row)]));
    return {
      indexId,
      lexical: new Bm25Index(
        rows.map((row) => ({ id: row.id, text: row.indexText })),
        this.analyzer,
        this.bm25,
      ),
      vector: new VectorIndex(rows.map((row) => ({ id: row.id, vector: row.embedding }))),
      chunks,
    };
  }
}

function withoutEmbedding(row: EmbeddedChunk): Chunk {
  return copyChunk({
    id: row.id,
    indexId: row.indexId,
    ordinal: row.ordinal,
    section: row.section,
    title: row.title,
    entityKeys: row.entityKeys,
    text: row.text,
    context: row.context,
    indexText: row.indexText,
    tokenCount: row.tokenCount,
  });
}

function copyChunk(chunk: Chunk): Chunk {
  return { ...chunk, entityKeys: [...chunk.entityKeys] };
}
