import { expect, test } from "bun:test";

import {
  RagIndexNotFoundError,
  RagIndexStateError,
  type IndexConfig,
  type RagIndex,
} from "@/server/domain/rag";
import {
  fakeTransaction,
  MemoryRagChunks,
  MemoryRagIndexes,
} from "@/server/rag/__fixtures__/memory-rag-repositories";
import type { IndexBuilding, IndexBuildJob } from "@/server/rag/indexing/index-builder";
import {
  canActivateIndex,
  canDeleteIndex,
  isIndexBuildInProgress,
  isIndexBuildStalled,
  RagIndexService,
} from "@/server/services/rag-index-service";

const now = new Date("2026-09-28T12:00:00.000Z");

const defaultConfig: IndexConfig = {
  chunker: "structured",
  contextualize: true,
  embeddingModel: "embed-model",
  contextModel: "utility-model",
};

const stats = { chunks: 3, tokens: 90, durationMs: 1200, costUsd: null, contextFailures: 0 };

// Creates a building index on start and marks it ready (or failed) on run, like IndexBuilder.
class FakeBuilder implements IndexBuilding {
  configs: IndexConfig[] = [];
  fail = false;

  constructor(
    private readonly indexes: MemoryRagIndexes,
    private readonly chunks: MemoryRagChunks,
  ) {}

  async start(config: IndexConfig): Promise<IndexBuildJob> {
    this.configs.push(config);
    const index = await this.indexes.create({
      sourceType: "cv",
      sourceId: "cv-1",
      config,
      createdAt: now.toISOString(),
    });
    return {
      index,
      run: async () => {
        if (this.fail) {
          await this.indexes.markFailed(index.id, "boom", now.toISOString());
          throw new Error("boom");
        }
        await this.chunks.insertMany(
          [
            {
              ordinal: 0,
              section: "profile",
              title: "Jane Doe",
              entityKeys: ["profile"],
              text: "# Jane Doe",
              context: null,
              indexText: "# Jane Doe",
              tokenCount: 3,
              embedding: [1],
            },
          ],
          index.id,
        );
        const ready = await this.indexes.markReady(index.id, stats, now.toISOString());
        if (!ready) throw new Error("not building");
        return ready;
      },
    };
  }
}

function setup() {
  const indexes = new MemoryRagIndexes();
  const chunks = new MemoryRagChunks();
  const builder = new FakeBuilder(indexes, chunks);
  let transactions = 0;
  const service = new RagIndexService(
    builder,
    indexes,
    chunks,
    (work) => {
      transactions += 1;
      return fakeTransaction(work);
    },
    defaultConfig,
    () => now,
  );
  return { service, indexes, chunks, builder, transactions: () => transactions };
}

async function rejectionOf<T extends Error>(
  type: new (...args: never[]) => T,
  work: () => Promise<unknown>,
): Promise<T> {
  try {
    await work();
  } catch (error) {
    if (error instanceof type) return error;
    throw error;
  }
  throw new Error(`Expected ${type.name}.`);
}

function indexAt(overrides: Partial<RagIndex>): RagIndex {
  return {
    id: "index-1",
    sourceType: "cv",
    sourceId: "cv-1",
    config: defaultConfig,
    state: "ready",
    active: false,
    error: null,
    stats,
    createdAt: now.toISOString(),
    finishedAt: now.toISOString(),
    ...overrides,
  };
}

test("the publish listener builds the default index and activates it", async () => {
  const { service, indexes, chunks, builder, transactions } = setup();

  await service.onCvPublished();

  expect(builder.configs).toEqual([defaultConfig]);
  expect(indexes.events).toEqual(["create", "markReady", "ready", "activate"]);
  expect(transactions()).toBe(1);
  const active = await indexes.findActive();
  expect(active?.state).toBe("ready");
  expect((await chunks.listByIndex(active?.id ?? "")).length).toBe(1);
});

test("a later publish replaces the active index", async () => {
  const { service, indexes } = setup();

  const first = await service.buildAndActivate(defaultConfig);
  const second = await service.buildAndActivate(defaultConfig);

  expect((await indexes.findActive())?.id).toBe(second.id);
  expect((await indexes.findById(first.id))?.active).toBe(false);
});

test("a failed build is not activated", async () => {
  const { service, indexes, builder } = setup();
  builder.fail = true;

  await rejectionOf(Error, () => service.onCvPublished());

  expect(indexes.events).not.toContain("activate");
  expect(await indexes.findActive()).toBeNull();
});

test("build leaves the new index inactive", async () => {
  const { service } = setup();

  const index = await service.build({ ...defaultConfig, chunker: "token-window" });

  expect(index.state).toBe("ready");
  expect(index.active).toBe(false);
});

test("the active index cannot be deleted", async () => {
  const { service, indexes, chunks } = setup();
  const active = await service.buildAndActivate(defaultConfig);

  const error = await rejectionOf(RagIndexStateError, () => service.delete(active.id));

  expect(error.message).toBe("The active index cannot be deleted.");
  expect(indexes.events).not.toContain("delete");
  expect((await chunks.listByIndex(active.id)).length).toBe(1);
});

test("deleting an inactive index removes it and its chunks", async () => {
  const { service, indexes, chunks } = setup();
  const index = await service.build(defaultConfig);

  await service.delete(index.id);

  expect(await indexes.findById(index.id)).toBeNull();
  expect(await chunks.listByIndex(index.id)).toEqual([]);
});

test("a running build cannot be deleted, a stalled one can", async () => {
  const { service, indexes } = setup();
  await service.startBuild(defaultConfig);

  await rejectionOf(RagIndexStateError, () => service.delete("index-1"));

  const [row] = indexes.rows;
  if (!row) throw new Error("expected a row");
  row.createdAt = "2026-09-28T11:50:00.000Z";
  await service.delete("index-1");
  expect(indexes.rows).toEqual([]);
});

test("unknown ids are reported", async () => {
  const { service } = setup();

  await rejectionOf(RagIndexNotFoundError, () => service.delete("missing"));
  await rejectionOf(RagIndexNotFoundError, () => service.activate("missing"));
  expect(await service.getWithChunks("missing")).toBeNull();
});

test("activate needs a ready index", async () => {
  const { service } = setup();
  const job = await service.startBuild(defaultConfig);

  await rejectionOf(RagIndexStateError, () => service.activate(job.index.id));
});

test("getWithChunks returns the index with its chunks", async () => {
  const { service } = setup();
  const index = await service.build(defaultConfig);

  const found = await service.getWithChunks(index.id);

  expect(found?.index.id).toBe(index.id);
  expect(found?.chunks.map((chunk) => chunk.text)).toEqual(["# Jane Doe"]);
});

test("list validates its limit", async () => {
  const { service } = setup();
  await service.build(defaultConfig);

  expect((await service.list(10)).length).toBe(1);
  let error: unknown = null;
  try {
    await service.list(0);
  } catch (caught) {
    error = caught;
  }
  expect(error instanceof RangeError).toBe(true);
});

test("state helpers", () => {
  const building = indexAt({ state: "building", stats: null, finishedAt: null });
  const stalled = { ...building, createdAt: "2026-09-28T11:55:00.000Z" };

  expect(isIndexBuildInProgress(building, now)).toBe(true);
  expect(isIndexBuildStalled(building, now)).toBe(false);
  expect(isIndexBuildInProgress(stalled, now)).toBe(false);
  expect(isIndexBuildStalled(stalled, now)).toBe(true);

  expect(canActivateIndex(indexAt({}))).toBe(true);
  expect(canActivateIndex(indexAt({ active: true }))).toBe(false);
  expect(canActivateIndex(indexAt({ state: "failed" }))).toBe(false);

  expect(canDeleteIndex(indexAt({}), now)).toBe(true);
  expect(canDeleteIndex(indexAt({ active: true }), now)).toBe(false);
  expect(canDeleteIndex(building, now)).toBe(false);
  expect(canDeleteIndex(stalled, now)).toBe(true);
});
