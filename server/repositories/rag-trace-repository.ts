import "server-only";

import type { WithId } from "mongodb";

import type {
  RagTraceRepository,
  RetrievalConfig,
  RetrievalTrace,
  TraceListFilter,
  TraceSource,
  TraceStage,
} from "@/server/domain/rag";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

export const RAG_TRACE_TTL_SECONDS = 30 * 24 * 3600;

// `_id` is the recorder's trace id, so a chat message can reference a trace before it is saved.
type RagTraceDocument = {
  _id: string;
  kind: RetrievalTrace["kind"];
  indexId: string | null;
  config: RetrievalConfig;
  stages: TraceStage[];
  sources: TraceSource[];
  totalMs: number;
  createdAt: Date;
};

export class MongoRagTraceRepository
  extends MongoRepository<RetrievalTrace, RagTraceDocument>
  implements RagTraceRepository
{
  constructor() {
    super("rag_traces");
  }

  protected toEntity(document: WithId<RagTraceDocument>): RetrievalTrace {
    return {
      id: document._id,
      kind: document.kind,
      indexId: document.indexId,
      config: { ...document.config },
      stages: document.stages.map((stage) => ({ ...stage })),
      sources: document.sources.map(copySource),
      totalMs: document.totalMs,
      createdAt: document.createdAt.toISOString(),
    };
  }

  protected override createIndexes(): Promise<unknown> {
    return Promise.all([
      this.collection().createIndex({ createdAt: -1 }),
      this.collection().createIndex({ createdAt: 1 }, { expireAfterSeconds: RAG_TRACE_TTL_SECONDS }),
    ]);
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async save(trace: RetrievalTrace): Promise<void> {
    if (trace.id.trim() === "") throw new Error("A trace needs an id before it is saved.");
    await this.ensureReady();
    await this.collection().insertOne({
      _id: trace.id,
      kind: trace.kind,
      indexId: trace.indexId,
      config: { ...trace.config },
      stages: trace.stages.map((stage) => ({ ...stage })),
      sources: trace.sources.map(copySource),
      totalMs: trace.totalMs,
      createdAt: parseInstant(trace.createdAt),
    });
  }

  async findById(id: string): Promise<RetrievalTrace | null> {
    await this.ensureReady();
    const document = await this.collection().findOne({ _id: id });
    return document ? this.toEntity(document) : null;
  }

  async list(limit: number, filter: TraceListFilter = {}): Promise<RetrievalTrace[]> {
    await this.ensureReady();
    const documents = await this.collection()
      .find({
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.ids ? { _id: { $in: [...filter.ids] } } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => this.toEntity(document));
  }
}

function copySource(source: TraceSource): TraceSource {
  return { ...source, entityKeys: [...source.entityKeys] };
}
