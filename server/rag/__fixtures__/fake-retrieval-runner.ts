import {
  RetrievalError,
  type QueryScope,
  type RagIndex,
  type RetrievalRequest,
  type RetrievalResult,
  type RetrievalRunner,
  type RetrievalTrace,
  type RetrievedChunk,
  type TraceStage,
} from "@/server/domain/rag";

export function readyIndex(id: string, overrides: Partial<RagIndex["config"]> = {}): RagIndex {
  return {
    id,
    sourceType: "cv",
    sourceId: "cv-1",
    config: {
      chunker: "structured",
      contextualize: true,
      embeddingModel: "embed-model",
      contextModel: "context-model",
      ...overrides,
    },
    state: "ready",
    active: true,
    error: null,
    stats: null,
    createdAt: "2026-09-28T08:00:00.000Z",
    finishedAt: "2026-09-28T08:01:00.000Z",
  };
}

function stage(
  name: string,
  durationMs: number,
  error: string | null = null,
  output: unknown = null,
): TraceStage {
  return { name, input: null, output, startedAt: 0, durationMs, error };
}

export type FakeRunnerOptions = {
  // The scope a question ends with. Defaults to cv when it has answers, else off_topic. A
  // non-cv scope returns no chunks, as the pipeline does.
  scopes?: Record<string, QueryScope>;
  // With `scopeRouter: "decision"`, questions whose route stage falls back (1 ms, before rewrite).
  routerFallbacks?: readonly string[];
};

// Answers each question with chunks carrying the given entity keys, titled by their first key.
// Rewrite and lexical search take 1 and 2 ms, rerank 5 ms when the config reranks.
export class FakeRetrievalRunner implements RetrievalRunner {
  readonly requests: RetrievalRequest[] = [];

  constructor(
    private readonly answers: Record<string, string[][]>,
    // Questions whose run fails at the lexical-search stage with this error.
    private readonly failures: Record<string, string> = {},
    private readonly options: FakeRunnerOptions = {},
  ) {}

  async run(request: RetrievalRequest): Promise<RetrievalResult> {
    this.requests.push(request);
    const route = this.routeStages(request);
    const failure = this.failures[request.message];
    if (failure !== undefined) {
      const stages = [...route, stage("rewrite", 1), stage("lexical-search", 2, failure)];
      throw new RetrievalError(this.trace(request, stages, 3), new Error(failure));
    }

    const stages = [...route, stage("rewrite", 1), stage("lexical-search", 2)];
    if (request.config.rerank) stages.push(stage("rerank", 5));
    const answers = this.answers[request.message] ?? [];
    const scope = this.options.scopes?.[request.message] ?? (answers.length > 0 ? "cv" : "off_topic");
    const chunks = (scope === "cv" ? answers : []).map(
      (entityKeys, index): RetrievedChunk => ({
        id: `c${index + 1}`,
        indexId: request.indexId ?? "active",
        ordinal: index,
        section: "experience",
        title: entityKeys[0] ?? "untitled",
        entityKeys,
        text: "text",
        context: null,
        indexText: "text",
        tokenCount: 1,
        fusedScore: 1 / (index + 1),
        rerankScore: request.config.rerank ? 0.9 : null,
        sourceId: `S${index + 1}`,
      }),
    );
    return {
      chunks,
      scope,
      queries: [request.message],
      trace: this.trace(request, stages, request.config.rerank ? 10 : 4),
    };
  }

  private routeStages(request: RetrievalRequest): TraceStage[] {
    if (request.config.scopeRouter !== "decision") return [];
    const fallback = this.options.routerFallbacks?.includes(request.message) ?? false;
    return [
      stage("route", 1, null, {
        scope: null,
        probabilities: null,
        choice: null,
        model: null,
        fallback,
        error: fallback ? "router down" : null,
      }),
    ];
  }

  private trace(request: RetrievalRequest, stages: TraceStage[], totalMs: number): RetrievalTrace {
    return {
      id: `trace-${this.requests.length}`,
      kind: request.kind,
      indexId: request.indexId ?? null,
      config: request.config,
      stages,
      sources: [],
      totalMs,
      createdAt: "2026-09-29T08:00:00.000Z",
    };
  }
}
