import type { CvVersionRepository } from "@/server/domain/cv";
import type { ChatClient, EmbeddingClient, RerankClient } from "@/server/domain/llm";
import type {
  Chunker,
  ChunkerKind,
  CorpusSource,
  IndexConfig,
  QueryRewriter,
  RagChunkRepository,
  RagIndexRepository,
  Reranker,
  Retriever,
} from "@/server/domain/rag";
import type { LlmEnv } from "@/server/llm/llm-env";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import { TokenWindowChunker } from "@/server/rag/chunking/token-window-chunker";
import { LlmContextualizer } from "@/server/rag/contextualize/llm-contextualizer";
import { CvCorpusSource } from "@/server/rag/corpus/cv-corpus-source";
import { IndexBuilder } from "@/server/rag/indexing/index-builder";
import { defaultIndexConfig } from "@/server/rag/indexing/index-config";
import { LlmQueryRewriter } from "@/server/rag/query/llm-query-rewriter";
import { ApiReranker } from "@/server/rag/rerank/api-reranker";
import {
  InMemoryRetriever,
  sharedSearchIndexCache,
  type SearchIndexCache,
} from "@/server/rag/search/in-memory-retriever";
import { RagIndexService, type TransactionRunner } from "@/server/services/rag-index-service";

// Everything with I/O is passed in, so this module stays free of `server-only` and `next/*`
// and scripts can compose the same pipeline as the app.
export type RagDependencies = {
  llm: ChatClient & EmbeddingClient & RerankClient;
  cvVersions: Pick<CvVersionRepository, "findPublished">;
  indexes: RagIndexRepository;
  chunks: RagChunkRepository;
  transaction: TransactionRunner;
  now?: () => Date;
  // Loaded search indexes. Defaults to the process-wide cache.
  searchCache?: SearchIndexCache;
};

export type Rag = {
  corpus: CorpusSource;
  chunkers: Readonly<Record<ChunkerKind, Chunker>>;
  defaultIndexConfig: IndexConfig;
  indexBuilder: IndexBuilder;
  indexService: RagIndexService;
  retriever: Retriever;
  queryRewriter: QueryRewriter;
  reranker: Reranker;
};

// Composition root for the RAG components.
export function createRag(env: LlmEnv, deps: RagDependencies): Rag {
  const now = deps.now ?? (() => new Date());
  const corpus = new CvCorpusSource(deps.cvVersions);
  const chunkers: Record<ChunkerKind, Chunker> = {
    structured: new StructuredCvChunker(),
    "token-window": new TokenWindowChunker(),
  };
  const indexBuilder = new IndexBuilder({
    corpus,
    chunkers,
    contextualizers: (chat, model) => new LlmContextualizer(chat, model),
    chat: deps.llm,
    embeddings: deps.llm,
    indexes: deps.indexes,
    chunks: deps.chunks,
    now,
  });
  const config = defaultIndexConfig(env);
  const indexService = new RagIndexService(
    indexBuilder,
    deps.indexes,
    deps.chunks,
    deps.transaction,
    config,
    now,
  );
  const retriever = new InMemoryRetriever(deps.chunks, {
    cache: deps.searchCache ?? sharedSearchIndexCache(),
  });
  const queryRewriter = new LlmQueryRewriter(deps.llm, env.LLM_UTILITY_MODEL);
  const reranker = new ApiReranker(deps.llm, env.RERANK_MODEL);
  return {
    corpus,
    chunkers,
    defaultIndexConfig: config,
    indexBuilder,
    indexService,
    retriever,
    queryRewriter,
    reranker,
  };
}
