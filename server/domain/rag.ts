import type { TransactionContext } from "@/server/db/transaction";
import type { ChatTurn } from "@/server/domain/chat";
import type { CvData } from "@/server/domain/cv";

// ---- Indexes ----

export type ChunkerKind = "structured" | "token-window";

export type IndexConfig = {
  chunker: ChunkerKind;
  contextualize: boolean;
  embeddingModel: string;
  // Model that wrote the chunk contexts. Null when `contextualize` is false.
  contextModel: string | null;
};

export type RagIndexState = "building" | "ready" | "failed";

export type RagIndexStats = {
  chunks: number;
  // Estimated tokens of the embedded `indexText`s.
  tokens: number;
  durationMs: number;
  // Null when the provider reported no cost.
  costUsd: number | null;
  // Chunks indexed without a context because contextualizing them failed. 0 without contextualization.
  contextFailures: number;
};

export type RagSourceType = "cv";

export type RagIndex = {
  id: string;
  sourceType: RagSourceType;
  // Id of the source document, e.g. the published CV version.
  sourceId: string;
  config: IndexConfig;
  state: RagIndexState;
  active: boolean;
  error: string | null;
  stats: RagIndexStats | null;
  createdAt: string;
  finishedAt: string | null;
};

export type NewRagIndex = {
  sourceType: RagSourceType;
  sourceId: string;
  config: IndexConfig;
  createdAt: string;
};

// ---- Chunks ----

export type Chunk = {
  id: string;
  indexId: string;
  ordinal: number;
  section: string;
  title: string;
  entityKeys: string[];
  text: string;
  context: string | null;
  // What is embedded and searched: `context + "\n\n" + text`, or `text` without context.
  indexText: string;
  tokenCount: number;
};

export type EmbeddedChunk = Chunk & { embedding: number[] };

// A chunk as it leaves a chunker, before contextualization and storage.
export type ChunkDraft = Omit<Chunk, "id" | "indexId" | "context" | "indexText">;

// A chunk ready to be stored. The repository assigns `id` and `indexId`.
export type NewEmbeddedChunk = Omit<EmbeddedChunk, "id" | "indexId">;

// ---- Corpus and indexing components ----

export type CorpusDocument = {
  sourceType: RagSourceType;
  sourceId: string;
  title: string;
  markdown: string;
  data: CvData;
};

export interface CorpusSource {
  load(): Promise<CorpusDocument | null>;
}

export interface Chunker {
  chunk(doc: CorpusDocument): ChunkDraft[];
}

export interface Contextualizer {
  // One entry per text, in order. Null means no context for that text.
  contextualize(doc: CorpusDocument, texts: string[]): Promise<(string | null)[]>;
}

// ---- Retrieval ----

// `rank` is 1-based.
export type RankedHit = { chunkId: string; rank: number; score: number };

// Turns text into the terms a lexical index matches. Documents and queries must share one analyzer.
export interface TextAnalyzer {
  analyze(text: string): string[];
}

export type LexicalSearchOptions = {
  // Query terms that are also terms of this text are dropped, e.g. the CV subject's name, which
  // matches the chunks that mention the name rather than the chunks that answer the question.
  ignoreTermsOf?: string;
};

// Searches the chunks of one stored index.
export interface Retriever {
  searchLexical(
    indexId: string,
    query: string,
    k: number,
    options?: LexicalSearchOptions,
  ): Promise<RankedHit[]>;
  // `vector` is a query embedding from the index's embedding model. It need not be normalized.
  searchVector(indexId: string, vector: readonly number[], k: number): Promise<RankedHit[]>;
  // The chunks with these ids, in the order of `ids`. Unknown ids are skipped.
  getChunks(indexId: string, ids: readonly string[]): Promise<Chunk[]>;
}

export type QueryRewriteMode = "none" | "standalone" | "multi";

// What the latest message asks for. Only `cv` messages need sources.
export type QueryScope = "cv" | "smalltalk" | "off_topic";

export type RewriteInput = {
  message: string;
  // Earlier turns, oldest first. The rewriter reads only the most recent ones.
  history: readonly ChatTurn[];
  mode: QueryRewriteMode;
  // Whose CV is searched, e.g. the published profile's full name.
  subjectName: string;
};

export type RewriteResult = {
  // Search queries, the standalone one first. Never empty.
  queries: string[];
  scope: QueryScope;
  // The model's parsed output for the trace, the error message after a fallback, or null in mode `none`.
  raw: unknown;
};

export interface QueryRewriter {
  // Never throws for a provider or parse failure. It falls back to the message itself.
  rewrite(input: RewriteInput): Promise<RewriteResult>;
}

// Who decides the scope: the rewriter alone, or a decision model first (Phase 2.14).
export type ScopeRouterKind = "rewriter" | "decision";

export type RouteInput = {
  message: string;
  // Earlier turns, oldest first. The router reads only the most recent ones.
  history: readonly ChatTurn[];
  subjectName: string;
  // A small-talk or off-topic choice short-circuits only at or above this probability.
  minConfidence: number;
};

export type RouteDecision = {
  // Set only for a confident short-circuit. Null: the rewriter decides, as without a router.
  scope: "smalltalk" | "off_topic" | null;
  // Null after a fallback.
  probabilities: Record<QueryScope, number> | null;
  choice: QueryScope | null;
  // The model that answered, as the provider named it. Null when nothing answered.
  model: string | null;
  // True when the router could not decide: a provider error, a timeout or an unreadable answer.
  fallback: boolean;
  error: string | null;
};

export interface ScopeRouter {
  // The model asked, for the trace.
  readonly model: string;
  // Never throws for a provider or parse failure. It defers to the rewriter instead.
  route(input: RouteInput): Promise<RouteDecision>;
}

// One search result list to fuse, named for the trace, e.g. `vector:q0` or `bm25:q1`.
export type NamedHitList = { name: string; hits: readonly RankedHit[] };

export type FusedHit = {
  chunkId: string;
  score: number;
  // Where the chunk ranked in each list that returned it, in list order.
  contributions: { list: string; rank: number }[];
};

// `text` is what the reranker reads: the chunk's `indexText`.
export type RerankCandidate = { chunkId: string; text: string };

export type RerankedHit = { chunkId: string; score: number };

export type RerankOutcome = {
  // Best first, at most `topN`.
  hits: RerankedHit[];
  // True when the reranker could not score and kept the candidate order instead.
  fallback: boolean;
  // Why it fell back, for the trace. Null otherwise.
  error: string | null;
};

export interface Reranker {
  // Never throws for a provider failure. It falls back to the candidate order.
  rerank(
    query: string,
    candidates: readonly RerankCandidate[],
    topN: number,
  ): Promise<RerankOutcome>;
}

export type SearchMode = "vector" | "lexical" | "hybrid";

export type RetrievalConfig = {
  rewrite: QueryRewriteMode;
  search: SearchMode;
  candidatesPerSearch: number;
  rrfK: number;
  fusedLimit: number;
  rerank: boolean;
  finalK: number;
  minRerankScore: number;
  // Drop the subject's name from BM25 queries. Vector search keeps it.
  ignoreSubjectInLexical: boolean;
  // Remove the subject's name from the rerank query and candidate texts.
  ignoreSubjectInRerank: boolean;
  // Also drop reranked hits scoring below the mean of that turn's reranked scores.
  dropBelowMeanRerank: boolean;
  // `decision` asks a decision model for the scope before the rewrite.
  scopeRouter: ScopeRouterKind;
  // The router's short-circuit cutoff. Unused with `rewriter`.
  minRouteConfidence: number;
};

// The retrieval config every chat turn runs with.
export type ChatRetrievalSettings = {
  config: RetrievalConfig;
  // Null while the defaults are used: never saved, or the saved config no longer parses.
  updatedAt: string | null;
};

// A chunk the pipeline returns, with the source id the answer cites (`S1`..`Sn`).
export type RetrievedChunk = Chunk & {
  fusedScore: number;
  // Null when reranking was off or fell back to the fused order.
  rerankScore: number | null;
  sourceId: string;
};

export type RetrievalRequest = {
  message: string;
  // Earlier turns, oldest first.
  history: readonly ChatTurn[];
  config: RetrievalConfig;
  // Defaults to the active index.
  indexId?: string;
  subjectName: string;
  kind: RetrievalTraceKind;
  // Told about each stage as it runs, e.g. to stream chat progress.
  observer?: TraceObserver;
};

export type RetrievalResult = {
  // Best first. Empty when the message is off topic.
  chunks: RetrievedChunk[];
  scope: QueryScope;
  queries: string[];
  trace: RetrievalTrace;
};

export interface RetrievalRunner {
  // Throws RetrievalError, with the trace so far, when a stage fails.
  run(request: RetrievalRequest): Promise<RetrievalResult>;
}

// ---- Traces ----

export type RetrievalTraceKind = "chat" | "playground" | "eval";

export type TraceStage = {
  name: string;
  input: unknown;
  output: unknown;
  // Milliseconds from the start of the trace.
  startedAt: number;
  durationMs: number;
  error: string | null;
};

// Watches a trace while it is recorded. The recorder catches and logs what these throw, so an
// observer can never fail a stage.
export interface TraceObserver {
  // `startedAt` is milliseconds from the start of the trace, as in TraceStage.
  stageStarted(name: string, startedAt: number): void;
  // A copy of the finished entry: its summarized output, or `error` set.
  stageEnded(stage: TraceStage): void;
}

// A final source as the trace keeps it, so the trace still reads after its index is deleted.
export type TraceSource = {
  sourceId: string;
  chunkId: string;
  title: string;
  section: string;
  entityKeys: string[];
  context: string | null;
  text: string;
  fusedScore: number;
  rerankScore: number | null;
};

export type RetrievalTrace = {
  // Assigned by the recorder, so a chat message can reference the trace before it is saved.
  id: string;
  kind: RetrievalTraceKind;
  indexId: string | null;
  config: RetrievalConfig;
  stages: TraceStage[];
  // The pipeline's final chunks, in source order. Empty when it failed or skipped retrieval.
  sources: TraceSource[];
  totalMs: number;
  createdAt: string;
};

// ---- Errors ----

// Base for RAG errors whose message is safe to show to the admin.
export abstract class RagError extends Error {}

export class RagIndexNotFoundError extends RagError {
  readonly id: string;

  constructor(id: string) {
    super(`RAG index "${id}" was not found.`);
    this.name = "RagIndexNotFoundError";
    this.id = id;
  }
}

// The index exists, but its state does not allow the action.
export class RagIndexStateError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "RagIndexStateError";
  }
}

export class NoActiveRagIndexError extends RagError {
  constructor() {
    super("No RAG index is active. Activate one, or choose an index.");
    this.name = "NoActiveRagIndexError";
  }
}

export class InvalidRetrievalConfigError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRetrievalConfigError";
  }
}

// A pipeline stage failed. Not a RagError: the cause may be a provider error, so callers show the
// trace (which records the stage error) rather than this message.
export class RetrievalError extends Error {
  readonly trace: RetrievalTrace;
  // Name of the failed stage, or null when the failure happened between stages.
  readonly stage: string | null;

  constructor(trace: RetrievalTrace, cause: unknown) {
    const stage = trace.stages.findLast((entry) => entry.error !== null)?.name ?? null;
    super(stage ? `Retrieval failed at the ${stage} stage.` : "Retrieval failed.", { cause });
    this.name = "RetrievalError";
    this.trace = trace;
    this.stage = stage;
  }
}

// ---- Repositories ----

// `activate` runs inside a caller-supplied transaction, so it does not build indexes.
// Call `ensureReady()` before opening that transaction.
export interface RagIndexRepository {
  ensureReady(): Promise<void>;
  // Creates an inactive index in state `building`.
  create(input: NewRagIndex): Promise<RagIndex>;
  findById(id: string): Promise<RagIndex | null>;
  findActive(): Promise<RagIndex | null>;
  // Newest first.
  list(limit: number): Promise<RagIndex[]>;
  // Both apply only while the index is `building`. Null when it is missing or already settled.
  markReady(id: string, stats: RagIndexStats, finishedAt: string): Promise<RagIndex | null>;
  markFailed(id: string, error: string, finishedAt: string): Promise<RagIndex | null>;
  // Deactivates the current index and activates `id`.
  // Throws RagIndexNotFoundError, or RagIndexStateError when `id` is not `ready`.
  activate(id: string, tx: TransactionContext): Promise<RagIndex>;
  // Deletes an inactive index. Returns false when it is missing or active.
  delete(id: string): Promise<boolean>;
}

export interface RagChunkRepository {
  ensureReady(): Promise<void>;
  // Stores the chunks under `indexId` and returns how many were stored.
  insertMany(chunks: NewEmbeddedChunk[], indexId: string): Promise<number>;
  // In `ordinal` order.
  listByIndex(indexId: string): Promise<EmbeddedChunk[]>;
  // Returns how many chunks were deleted.
  deleteByIndex(indexId: string): Promise<number>;
}

export interface RagTraceRepository {
  ensureReady(): Promise<void>;
  save(trace: RetrievalTrace): Promise<void>;
  findById(id: string): Promise<RetrievalTrace | null>;
  // Newest first.
  list(limit: number): Promise<RetrievalTrace[]>;
}

// Site-wide RAG settings. Configs are returned raw, because a stored one may predate the schema.
export interface RagSettingsRepository {
  ensureReady(): Promise<void>;
  findChatConfig(): Promise<{ config: unknown; updatedAt: string } | null>;
  saveChatConfig(config: RetrievalConfig, updatedAt: string): Promise<void>;
}
