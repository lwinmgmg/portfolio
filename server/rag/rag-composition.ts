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
  RagSettingsRepository,
  RagTraceRepository,
  Reranker,
  RetrievalRunner,
  Retriever,
} from "@/server/domain/rag";
import { AdaptiveChatClient } from "@/server/llm/adaptive-chat-client";
import type { LlmEnv } from "@/server/llm/llm-env";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import { TokenWindowChunker } from "@/server/rag/chunking/token-window-chunker";
import { LlmContextualizer } from "@/server/rag/contextualize/llm-contextualizer";
import { CvCorpusSource } from "@/server/rag/corpus/cv-corpus-source";
import { IndexBuilder } from "@/server/rag/indexing/index-builder";
import { defaultIndexConfig } from "@/server/rag/indexing/index-config";
import { RetrievalPipeline } from "@/server/rag/pipeline/retrieval-pipeline";
import { LlmQueryRewriter } from "@/server/rag/query/llm-query-rewriter";
import { ApiReranker } from "@/server/rag/rerank/api-reranker";
import {
  InMemoryRetriever,
  sharedSearchIndexCache,
  type SearchIndexCache,
} from "@/server/rag/search/in-memory-retriever";
import { RagIndexService, type TransactionRunner } from "@/server/services/rag-index-service";
import { RagSettingsService } from "@/server/services/rag-settings-service";
import { RetrievalPlaygroundService } from "@/server/services/retrieval-playground-service";

// Everything with I/O is passed in, so this module stays free of `server-only` and `next/*`
// and scripts can compose the same pipeline as the app.
export type RagDependencies = {
  llm: ChatClient & EmbeddingClient & RerankClient;
  cvVersions: Pick<CvVersionRepository, "findPublished">;
  indexes: RagIndexRepository;
  chunks: RagChunkRepository;
  traces: Pick<RagTraceRepository, "save">;
  settings: RagSettingsRepository;
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
  pipeline: RetrievalRunner;
  playground: RetrievalPlaygroundService;
  settings: RagSettingsService;
};

// Composition root for the RAG components.
export function createRag(env: LlmEnv, deps: RagDependencies): Rag {
  const now = deps.now ?? (() => new Date());
  // The contextualizer and rewriter run on whatever LLM_UTILITY_MODEL is set to, so they adapt
  // to what its endpoints accept.
  const utilityChat = new AdaptiveChatClient(deps.llm);
  const corpus = new CvCorpusSource(deps.cvVersions);
  const chunkers: Record<ChunkerKind, Chunker> = {
    structured: new StructuredCvChunker(),
    "token-window": new TokenWindowChunker(),
  };
  const indexBuilder = new IndexBuilder({
    corpus,
    chunkers,
    contextualizers: (chat, model) => new LlmContextualizer(chat, model),
    chat: utilityChat,
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
  const queryRewriter = new LlmQueryRewriter(utilityChat, env.LLM_UTILITY_MODEL);
  const reranker = new ApiReranker(deps.llm, env.RERANK_MODEL);
  const pipeline = new RetrievalPipeline({
    indexes: deps.indexes,
    retriever,
    rewriter: queryRewriter,
    reranker,
    embeddings: deps.llm,
    now,
  });
  const playground = new RetrievalPlaygroundService(pipeline, deps.traces, deps.cvVersions);
  const settings = new RagSettingsService(deps.settings, now);
  return {
    corpus,
    chunkers,
    defaultIndexConfig: config,
    indexBuilder,
    indexService,
    retriever,
    queryRewriter,
    reranker,
    pipeline,
    playground,
    settings,
  };
}
