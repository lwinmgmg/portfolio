import {
  RetrievalError,
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

function stage(name: string, durationMs: number, error: string | null = null): TraceStage {
  return { name, input: null, output: null, startedAt: 0, durationMs, error };
}

// Answers each question with chunks carrying the given entity keys, titled by their first key.
// Rewrite and lexical search take 1 and 2 ms, rerank 5 ms when the config reranks.
export class FakeRetrievalRunner implements RetrievalRunner {
  readonly requests: RetrievalRequest[] = [];

  constructor(
    private readonly answers: Record<string, string[][]>,
    // Questions whose run fails at the lexical-search stage with this error.
    private readonly failures: Record<string, string> = {},
  ) {}

  async run(request: RetrievalRequest): Promise<RetrievalResult> {
    this.requests.push(request);
    const failure = this.failures[request.message];
    if (failure !== undefined) {
      const stages = [stage("rewrite", 1), stage("lexical-search", 2, failure)];
      throw new RetrievalError(this.trace(request, stages, 3), new Error(failure));
    }

    const stages = [stage("rewrite", 1), stage("lexical-search", 2)];
    if (request.config.rerank) stages.push(stage("rerank", 5));
    const chunks = (this.answers[request.message] ?? []).map(
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
      scope: chunks.length > 0 ? "cv" : "off_topic",
      queries: [request.message],
      trace: this.trace(request, stages, request.config.rerank ? 10 : 4),
    };
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
