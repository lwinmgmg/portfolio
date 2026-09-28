import { expect, test } from "bun:test";

import type { TransactionContext } from "@/server/db/transaction";
import type { IndexConfig, RagIndexState, RetrievalTrace } from "@/server/domain/rag";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";

let activeCollection: unknown;
const { mock } = (await import("bun:test")) as unknown as {
  mock: { module(id: string, factory: () => object): void };
};
class TestObjectId {
  constructor(private readonly value = "507f1f77bcf86cd799439011") {}

  static isValid(value: string): boolean {
    return /^[0-9a-f]{24}$/i.test(value);
  }

  toHexString(): string {
    return this.value;
  }
}

// Bun cannot load BSON's node:v8 snapshot probe; ObjectId conversion is not under test here.
mock.module("mongodb", () => ({ ObjectId: TestObjectId }));
mock.module("server-only", () => ({}));
mock.module("@/server/db/client", () => ({
  getDb: () => ({ collection: () => activeCollection }),
}));

const { MongoRagIndexRepository } = await import("@/server/repositories/rag-index-repository");
const { MongoRagChunkRepository } = await import("@/server/repositories/rag-chunk-repository");
const { MongoRagTraceRepository, RAG_TRACE_TTL_SECONDS } = await import(
  "@/server/repositories/rag-trace-repository"
);

const session = {} as TransactionContext["session"];
const tx = { session } as TransactionContext;

const config: IndexConfig = {
  chunker: "structured",
  contextualize: true,
  embeddingModel: "embed-model",
  contextModel: "utility-model",
};

function indexDocument(id: TestObjectId, state: RagIndexState = "ready", active = false) {
  return {
    _id: id,
    sourceType: "cv" as const,
    sourceId: "cv-1",
    config,
    state,
    active,
    error: null,
    stats: null,
    createdAt: new Date("2026-09-28T00:00:00.000Z"),
    finishedAt: null,
  };
}

function readyCollection(extra: Record<string, unknown> = {}) {
  return { createIndex: async () => undefined, ...extra };
}

// ---- rag_indexes ----

test("index repository creates the listing index and the single-active index", async () => {
  const indexes: unknown[][] = [];
  activeCollection = {
    createIndex: async (...args: unknown[]) => {
      indexes.push(args);
    },
  };

  await new MongoRagIndexRepository().ensureReady();

  expect(indexes).toEqual([
    [{ createdAt: -1 }],
    [{ active: 1 }, { unique: true, partialFilterExpression: { active: true } }],
  ]);
});

test("create stores an inactive building index", async () => {
  const captured: { document?: Record<string, unknown> } = {};
  activeCollection = readyCollection({
    insertOne: async (document: Record<string, unknown>) => {
      captured.document = document;
      return { insertedId: new TestObjectId() };
    },
  });

  const index = await new MongoRagIndexRepository().create({
    sourceType: "cv",
    sourceId: "cv-1",
    config,
    createdAt: "2026-09-28T00:00:00.000Z",
  });

  expect(captured.document?.createdAt).toEqual(new Date("2026-09-28T00:00:00.000Z"));
  expect(index).toEqual({
    id: "507f1f77bcf86cd799439011",
    sourceType: "cv",
    sourceId: "cv-1",
    config,
    state: "building",
    active: false,
    error: null,
    stats: null,
    createdAt: "2026-09-28T00:00:00.000Z",
    finishedAt: null,
  });
});

test("markReady and markFailed settle only a building index", async () => {
  const id = new TestObjectId();
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    findOneAndUpdate: async (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
  });
  const repository = new MongoRagIndexRepository();
  const stats = { chunks: 12, tokens: 900, durationMs: 4000, costUsd: null, contextFailures: 0 };
  const finishedAt = "2026-09-28T00:01:00.000Z";

  expect(await repository.markReady(id.toHexString(), stats, finishedAt)).toBeNull();
  await repository.markFailed(id.toHexString(), "Embedding failed.", finishedAt);

  expect(calls[0]?.[0]).toEqual({ _id: id, state: "building" });
  expect(calls[0]?.[1]).toEqual({
    $set: { state: "ready", stats, error: null, finishedAt: new Date(finishedAt) },
  });
  expect(calls[1]?.[0]).toEqual({ _id: id, state: "building" });
  expect(calls[1]?.[1]).toEqual({
    $set: { state: "failed", error: "Embedding failed.", finishedAt: new Date(finishedAt) },
  });
});

test("activate deactivates the current index and activates a ready one in the same session", async () => {
  const id = new TestObjectId();
  const calls: unknown[][] = [];
  activeCollection = {
    findOne: async (...args: unknown[]) => {
      calls.push(["findOne", ...args]);
      return indexDocument(id);
    },
    updateMany: async (...args: unknown[]) => {
      calls.push(["updateMany", ...args]);
    },
    findOneAndUpdate: async (...args: unknown[]) => {
      calls.push(["findOneAndUpdate", ...args]);
      return indexDocument(id, "ready", true);
    },
  };

  const activated = await new MongoRagIndexRepository().activate(id.toHexString(), tx);

  expect(activated.active).toBe(true);
  expect(calls).toEqual([
    ["findOne", { _id: id }, { session }],
    ["updateMany", { active: true, _id: { $ne: id } }, { $set: { active: false } }, { session }],
    [
      "findOneAndUpdate",
      { _id: id, state: "ready" },
      { $set: { active: true } },
      { returnDocument: "after", session },
    ],
  ]);
});

for (const state of ["building", "failed"] as const) {
  test(`activate rejects a ${state} index before deactivating the current one`, async () => {
    const id = new TestObjectId();
    let deactivated = false;
    activeCollection = {
      findOne: async () => indexDocument(id, state),
      updateMany: async () => {
        deactivated = true;
      },
    };

    await expect(new MongoRagIndexRepository().activate(id.toHexString(), tx)).rejects.toMatchObject({
      name: "RagIndexStateError",
      message: "Only a ready index can be activated.",
    });
    expect(deactivated).toBe(false);
  });
}

test("activate reports a missing or malformed id as not found", async () => {
  activeCollection = { findOne: async () => null };
  const repository = new MongoRagIndexRepository();

  await expect(repository.activate("507f1f77bcf86cd799439011", tx)).rejects.toMatchObject({
    name: "RagIndexNotFoundError",
  });
  await expect(repository.activate("not-an-id", tx)).rejects.toMatchObject({
    name: "RagIndexNotFoundError",
  });
});

test("delete removes only an inactive index", async () => {
  const id = new TestObjectId();
  let filter: unknown;
  activeCollection = readyCollection({
    deleteOne: async (value: unknown) => {
      filter = value;
      return { deletedCount: 0 };
    },
  });

  expect(await new MongoRagIndexRepository().delete(id.toHexString())).toBe(false);
  expect(filter).toEqual({ _id: id, active: false });
});

// ---- rag_chunks ----

const chunk = {
  ordinal: 0,
  section: "experience",
  title: "Engineer at Acme",
  entityKeys: ["experience:acme"],
  text: "Built things.",
  context: "Jane Doe's role at Acme.",
  indexText: "Jane Doe's role at Acme.\n\nBuilt things.",
  tokenCount: 10,
  embedding: [0.6, 0.8],
};

test("chunk repository indexes chunks by index and ordinal", async () => {
  const indexes: unknown[][] = [];
  activeCollection = {
    createIndex: async (...args: unknown[]) => {
      indexes.push(args);
    },
  };

  await new MongoRagChunkRepository().ensureReady();

  expect(indexes).toEqual([[{ indexId: 1, ordinal: 1 }]]);
});

test("insertMany stores each chunk under the index with its embedding array", async () => {
  const indexId = new TestObjectId("507f1f77bcf86cd799439012");
  const captured: { documents?: unknown[] } = {};
  activeCollection = readyCollection({
    insertMany: async (documents: unknown[]) => {
      captured.documents = documents;
      return { insertedCount: documents.length };
    },
  });

  const count = await new MongoRagChunkRepository().insertMany(
    [chunk, { ...chunk, ordinal: 1 }],
    indexId.toHexString(),
  );

  expect(count).toBe(2);
  expect(captured.documents).toEqual([
    { ...chunk, indexId },
    { ...chunk, ordinal: 1, indexId },
  ]);
});

test("insertMany skips an empty batch and rejects a malformed index id", async () => {
  let inserted = false;
  activeCollection = readyCollection({
    insertMany: async () => {
      inserted = true;
    },
  });
  const repository = new MongoRagChunkRepository();

  expect(await repository.insertMany([], "507f1f77bcf86cd799439012")).toBe(0);
  await expect(repository.insertMany([chunk], "bad-id")).rejects.toMatchObject({
    message: 'Invalid RAG index id "bad-id".',
  });
  expect(inserted).toBe(false);
});

test("listByIndex returns the index's chunks in ordinal order", async () => {
  const indexId = new TestObjectId("507f1f77bcf86cd799439012");
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    find: (filter: unknown) => {
      calls.push(["find", filter]);
      return {
        sort: (order: unknown) => {
          calls.push(["sort", order]);
          return {
            toArray: async () => [{ ...chunk, _id: new TestObjectId("507f1f77bcf86cd799439013"), indexId }],
          };
        },
      };
    },
  });

  const chunks = await new MongoRagChunkRepository().listByIndex(indexId.toHexString());

  expect(calls).toEqual([
    ["find", { indexId }],
    ["sort", { ordinal: 1 }],
  ]);
  expect(chunks).toEqual([
    { ...chunk, id: "507f1f77bcf86cd799439013", indexId: "507f1f77bcf86cd799439012" },
  ]);
});

test("deleteByIndex deletes every chunk of the index", async () => {
  const indexId = new TestObjectId("507f1f77bcf86cd799439012");
  let filter: unknown;
  activeCollection = readyCollection({
    deleteMany: async (value: unknown) => {
      filter = value;
      return { deletedCount: 7 };
    },
  });
  const repository = new MongoRagChunkRepository();

  expect(await repository.deleteByIndex(indexId.toHexString())).toBe(7);
  expect(filter).toEqual({ indexId });
  expect(await repository.deleteByIndex("bad-id")).toBe(0);
});

// ---- rag_traces ----

const trace: RetrievalTrace = {
  id: "trace-1",
  kind: "playground",
  indexId: "507f1f77bcf86cd799439012",
  config: { ...DEFAULT_RETRIEVAL_CONFIG },
  stages: [
    {
      name: "rewrite",
      input: { message: "Where did she work?" },
      output: { queries: ["Where did Jane Doe work?"] },
      startedAt: 0,
      durationMs: 120,
      error: null,
    },
  ],
  totalMs: 120,
  createdAt: "2026-09-28T00:00:00.000Z",
};

test("trace repository expires traces after 30 days", async () => {
  const indexes: unknown[][] = [];
  activeCollection = {
    createIndex: async (...args: unknown[]) => {
      indexes.push(args);
    },
  };

  await new MongoRagTraceRepository().ensureReady();

  expect(RAG_TRACE_TTL_SECONDS).toBe(2_592_000);
  expect(indexes).toEqual([
    [{ createdAt: -1 }],
    [{ createdAt: 1 }, { expireAfterSeconds: 2_592_000 }],
  ]);
});

test("save keys the trace by its recorder id and round-trips through findById", async () => {
  const stored: Record<string, unknown>[] = [];
  let filter: unknown;
  activeCollection = readyCollection({
    insertOne: async (document: Record<string, unknown>) => {
      stored.push(document);
    },
    findOne: async (value: unknown) => {
      filter = value;
      return stored[0] ?? null;
    },
  });
  const repository = new MongoRagTraceRepository();

  await repository.save(trace);
  const found = await repository.findById("trace-1");

  expect(stored[0]?._id).toBe("trace-1");
  expect(stored[0]?.createdAt).toEqual(new Date("2026-09-28T00:00:00.000Z"));
  expect(filter).toEqual({ _id: "trace-1" });
  expect(found).toEqual(trace);
});

test("save rejects a trace without an id", async () => {
  activeCollection = readyCollection({ insertOne: async () => undefined });

  await expect(new MongoRagTraceRepository().save({ ...trace, id: " " })).rejects.toMatchObject({
    message: "A trace needs an id before it is saved.",
  });
});
