import type {
  RetrievalConfig,
  RetrievalTrace,
  RetrievalTraceKind,
  TraceSource,
  TraceStage,
} from "@/server/domain/rag";

export type TraceRecorderOptions = {
  kind: RetrievalTraceKind;
  indexId: string | null;
  config: RetrievalConfig;
  id?: string;
  now?: () => Date;
  // Monotonic milliseconds. Defaults to performance.now().
  clock?: () => number;
};

// Times each pipeline stage and keeps its input and output for the trace. Stages are listed in
// the order they started, so stages that overlap still read in pipeline order.
export class TraceRecorder {
  readonly id: string;
  private readonly kind: RetrievalTraceKind;
  private readonly indexId: string | null;
  private readonly config: RetrievalConfig;
  private readonly clock: () => number;
  private readonly origin: number;
  private readonly createdAt: string;
  private readonly stages: TraceStage[] = [];

  constructor(options: TraceRecorderOptions) {
    this.id = options.id ?? crypto.randomUUID();
    this.kind = options.kind;
    this.indexId = options.indexId;
    this.config = { ...options.config };
    this.clock = options.clock ?? (() => performance.now());
    this.origin = this.clock();
    this.createdAt = (options.now ?? (() => new Date()))().toISOString();
  }

  // Runs `fn` as the stage `name`. `summarize` shapes what the trace keeps of the result, e.g. to
  // drop embedding vectors. A failure is recorded with its message and rethrown.
  async stage<T>(
    name: string,
    input: unknown,
    fn: () => Promise<T>,
    summarize?: (output: T) => unknown,
  ): Promise<T> {
    const started = this.clock();
    const entry: TraceStage = {
      name,
      input,
      output: null,
      startedAt: started - this.origin,
      durationMs: 0,
      error: null,
    };
    this.stages.push(entry);
    try {
      const output = await fn();
      entry.output = summarize ? summarize(output) : output;
      entry.durationMs = this.clock() - started;
      return output;
    } catch (error) {
      entry.durationMs = this.clock() - started;
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  toTrace(sources: readonly TraceSource[] = []): RetrievalTrace {
    return {
      id: this.id,
      kind: this.kind,
      indexId: this.indexId,
      config: { ...this.config },
      stages: this.stages.map((stage) => ({ ...stage })),
      sources: sources.map((source) => ({ ...source, entityKeys: [...source.entityKeys] })),
      totalMs: this.clock() - this.origin,
      createdAt: this.createdAt,
    };
  }
}
