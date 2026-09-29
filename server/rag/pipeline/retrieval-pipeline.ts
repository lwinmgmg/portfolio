import type { EmbeddingClient } from "@/server/domain/llm";
import {
  NoActiveRagIndexError,
  RagError,
  RagIndexNotFoundError,
  RagIndexStateError,
  RetrievalError,
  type Chunk,
  type FusedHit,
  type QueryRewriter,
  type RagIndex,
  type RagIndexRepository,
  type RankedHit,
  type Reranker,
  type RetrievalRequest,
  type RetrievalResult,
  type RetrievalRunner,
  type RetrievedChunk,
  type Retriever,
  type RewriteResult,
  type TraceSource,
} from "@/server/domain/rag";
import { embedInBatches } from "@/server/rag/embedding/embed-in-batches";
import { reciprocalRankFusion } from "@/server/rag/fusion/reciprocal-rank-fusion";
import { TraceRecorder } from "@/server/rag/pipeline/trace-recorder";
import {
  hitListName,
  STAGE,
  type EmbedStageOutput,
  type FilterStageOutput,
  type FuseStageOutput,
  type RerankStageOutput,
  type RewriteStageInput,
  type RewriteStageOutput,
  type SearchStageOutput,
  type TracedHit,
} from "@/server/rag/pipeline/trace-stages";

// A search result references a chunk its index does not hold.
export class UnknownChunkError extends RagError {
  constructor(chunkId: string, indexId: string) {
    super(`Chunk "${chunkId}" is not in RAG index "${indexId}".`);
    this.name = "UnknownChunkError";
  }
}

export type RetrievalPipelineDeps = {
  indexes: Pick<RagIndexRepository, "findById" | "findActive">;
  retriever: Retriever;
  rewriter: QueryRewriter;
  reranker: Reranker;
  // Queries are embedded with the searched index's model, never the env default.
  embeddings: EmbeddingClient;
  now?: () => Date;
  clock?: () => number;
  newTraceId?: () => string;
};

// rewrite -> embed -> vector / lexical search -> RRF -> rerank -> filter, each stage traced.
export class RetrievalPipeline implements RetrievalRunner {
  constructor(private readonly deps: RetrievalPipelineDeps) {}

  async run(request: RetrievalRequest): Promise<RetrievalResult> {
    const index = await this.resolveIndex(request.indexId);
    const recorder = new TraceRecorder({
      kind: request.kind,
      indexId: index.id,
      config: request.config,
      id: this.deps.newTraceId?.(),
      now: this.deps.now,
      clock: this.deps.clock,
    });
    try {
      return await new PipelineRun(this.deps, index, request, recorder).execute();
    } catch (error) {
      throw new RetrievalError(recorder.toTrace(), error);
    }
  }

  private async resolveIndex(indexId: string | undefined): Promise<RagIndex> {
    const index = indexId
      ? await this.deps.indexes.findById(indexId)
      : await this.deps.indexes.findActive();
    if (!index) throw indexId ? new RagIndexNotFoundError(indexId) : new NoActiveRagIndexError();
    if (index.state !== "ready") {
      throw new RagIndexStateError("Only a ready index can be searched.");
    }
    return index;
  }
}

type SearchList = SearchStageOutput["lists"][number];

// A chunk chosen for the answer, before it gets its source id.
type Selected = { chunkId: string; rank: number; fusedScore: number; rerankScore: number | null };

// State for one run: the request, its trace and the chunks seen so far.
class PipelineRun {
  private readonly chunks = new Map<string, Chunk>();

  constructor(
    private readonly deps: RetrievalPipelineDeps,
    private readonly index: RagIndex,
    private readonly request: RetrievalRequest,
    private readonly recorder: TraceRecorder,
  ) {}

  async execute(): Promise<RetrievalResult> {
    const rewrite = await this.rewrite();
    if (rewrite.scope === "off_topic") return this.result(rewrite, []);

    const { queries } = rewrite;
    const lists = [...(await this.vectorLists(queries)), ...(await this.lexicalLists(queries))];
    const fused = await this.fuse(lists);
    const selected = this.request.config.rerank
      ? await this.rerank(queries[0] ?? this.request.message, fused)
      : fused.slice(0, this.request.config.finalK).map((hit, index) => ({
          chunkId: hit.chunkId,
          rank: index + 1,
          fusedScore: hit.score,
          rerankScore: null,
        }));
    return this.result(rewrite, selected);
  }

  private rewrite(): Promise<RewriteResult> {
    const { message, history, subjectName, config } = this.request;
    const input: RewriteStageInput = {
      message,
      history: history.map((turn) => ({ ...turn })),
      mode: config.rewrite,
      subjectName,
    };
    return this.recorder.stage(
      STAGE.rewrite,
      input,
      () => this.deps.rewriter.rewrite({ message, history, mode: config.rewrite, subjectName }),
      (result): RewriteStageOutput => ({
        queries: [...result.queries],
        scope: result.scope,
        raw: result.raw,
      }),
    );
  }

  private async vectorLists(queries: string[]): Promise<SearchList[]> {
    if (this.request.config.search === "lexical") return [];
    const model = this.index.config.embeddingModel;
    // One call for every query; the batch limit is far above the rewriter's four queries.
    const vectors = await this.recorder.stage(
      STAGE.embedQueries,
      { model, queries },
      () => embedInBatches(this.deps.embeddings, model, queries),
      (output): EmbedStageOutput => ({
        model,
        count: output.length,
        dimensions: output[0]?.length ?? 0,
      }),
    );
    return this.search(STAGE.vectorSearch, "vector", queries, (_query, index, k) =>
      this.deps.retriever.searchVector(this.index.id, vectors[index] ?? [], k),
    );
  }

  private lexicalLists(queries: string[]): Promise<SearchList[]> {
    if (this.request.config.search === "vector") return Promise.resolve([]);
    return this.search(STAGE.lexicalSearch, "bm25", queries, (query, _index, k) =>
      this.deps.retriever.searchLexical(this.index.id, query, k),
    );
  }

  private search(
    stage: string,
    kind: "vector" | "bm25",
    queries: string[],
    find: (query: string, index: number, k: number) => Promise<RankedHit[]>,
  ): Promise<SearchList[]> {
    const k = this.request.config.candidatesPerSearch;
    return this.recorder.stage(
      stage,
      { queries, k },
      async () => {
        const found = await Promise.all(queries.map((query, index) => find(query, index, k)));
        await this.loadChunks(found.flat().map((hit) => hit.chunkId));
        return queries.map((query, index) => ({
          name: hitListName(kind, index),
          query,
          hits: (found[index] ?? []).map((hit) => this.traced(hit)),
        }));
      },
      (lists): SearchStageOutput => ({ lists }),
    );
  }

  // Returns the top `fusedLimit` fused hits. With one list the fused order is that list's order.
  private async fuse(lists: SearchList[]): Promise<FusedHit[]> {
    const { rrfK, fusedLimit } = this.request.config;
    const { hits } = await this.recorder.stage(
      STAGE.fuse,
      { lists: lists.map((list) => list.name), k: rrfK, limit: fusedLimit },
      async () => {
        const all = reciprocalRankFusion(lists, rrfK);
        return { total: all.length, hits: all.slice(0, fusedLimit) };
      },
      ({ total, hits: top }): FuseStageOutput => ({
        total,
        hits: top.map((hit, index) => ({
          ...this.traced({ chunkId: hit.chunkId, rank: index + 1, score: hit.score }),
          contributions: hit.contributions.map((entry) => ({ ...entry })),
        })),
      }),
    );
    return hits;
  }

  private async rerank(query: string, fused: FusedHit[]): Promise<Selected[]> {
    const { finalK } = this.request.config;
    const fusedById = new Map(
      fused.map((hit, index) => [hit.chunkId, { rank: index + 1, score: hit.score }]),
    );
    const fusedOf = (chunkId: string) => {
      const entry = fusedById.get(chunkId);
      if (!entry) throw new UnknownChunkError(chunkId, this.index.id);
      return entry;
    };
    const candidates = fused.map((hit) => ({
      chunkId: hit.chunkId,
      text: this.chunk(hit.chunkId).indexText,
    }));

    const outcome = await this.recorder.stage(
      STAGE.rerank,
      { query, candidates: candidates.length, topN: finalK },
      () => this.deps.reranker.rerank(query, candidates, finalK),
      (result): RerankStageOutput => ({
        fallback: result.fallback,
        error: result.error,
        hits: result.hits.map((hit, index) => ({
          ...this.traced({ chunkId: hit.chunkId, rank: index + 1, score: hit.score }),
          fusedRank: fusedOf(hit.chunkId).rank,
        })),
      }),
    );

    const selected = outcome.hits.map((hit, index) => ({
      chunkId: hit.chunkId,
      rank: index + 1,
      fusedScore: fusedOf(hit.chunkId).score,
      // Fallback scores are 1 / rank, not relevance, so they are neither kept nor filtered.
      rerankScore: outcome.fallback ? null : hit.score,
    }));
    return outcome.fallback ? selected : this.filter(selected);
  }

  private async filter(selected: Selected[]): Promise<Selected[]> {
    const min = this.request.config.minRerankScore;
    const passes = (hit: Selected) => hit.rerankScore === null || hit.rerankScore >= min;
    const { kept } = await this.recorder.stage(
      STAGE.filter,
      { minRerankScore: min, hits: selected.length },
      async () => ({
        kept: selected.filter(passes),
        dropped: selected.filter((hit) => !passes(hit)),
      }),
      (result): FilterStageOutput => ({
        minRerankScore: min,
        kept: result.kept.length,
        dropped: result.dropped.map((hit) =>
          this.traced({ chunkId: hit.chunkId, rank: hit.rank, score: hit.rerankScore ?? 0 }),
        ),
      }),
    );
    return kept;
  }

  private result(rewrite: RewriteResult, selected: Selected[]): RetrievalResult {
    const chunks: RetrievedChunk[] = selected.map((hit, index) => ({
      ...this.chunk(hit.chunkId),
      fusedScore: hit.fusedScore,
      rerankScore: hit.rerankScore,
      sourceId: `S${index + 1}`,
    }));
    return {
      chunks,
      scope: rewrite.scope,
      queries: [...rewrite.queries],
      trace: this.recorder.toTrace(chunks.map(toTraceSource)),
    };
  }

  private async loadChunks(ids: readonly string[]): Promise<void> {
    const missing = [...new Set(ids)].filter((id) => !this.chunks.has(id));
    if (missing.length === 0) return;
    for (const chunk of await this.deps.retriever.getChunks(this.index.id, missing)) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  private chunk(chunkId: string): Chunk {
    const chunk = this.chunks.get(chunkId);
    if (!chunk) throw new UnknownChunkError(chunkId, this.index.id);
    return chunk;
  }

  private traced(hit: RankedHit): TracedHit {
    const chunk = this.chunk(hit.chunkId);
    return {
      chunkId: hit.chunkId,
      rank: hit.rank,
      score: hit.score,
      title: chunk.title,
      section: chunk.section,
      entityKeys: [...chunk.entityKeys],
    };
  }
}

function toTraceSource(chunk: RetrievedChunk): TraceSource {
  return {
    sourceId: chunk.sourceId,
    chunkId: chunk.id,
    title: chunk.title,
    section: chunk.section,
    entityKeys: [...chunk.entityKeys],
    context: chunk.context,
    text: chunk.text,
    fusedScore: chunk.fusedScore,
    rerankScore: chunk.rerankScore,
  };
}
