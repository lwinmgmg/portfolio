import { expect, test } from "bun:test";

import type { NewEmbeddedChunk } from "@/server/domain/rag";
import { MemoryRagChunks } from "@/server/rag/__fixtures__/memory-rag-repositories";
import {
  createSearchIndexCache,
  InMemoryRetriever,
  SEARCH_INDEX_CACHE_SIZE,
  sharedSearchIndexCache,
} from "@/server/rag/search/in-memory-retriever";
import { EmptySearchIndexError } from "@/server/rag/search/search-errors";

function chunk(ordinal: number, indexText: string, embedding: number[]): NewEmbeddedChunk {
  return {
    ordinal,
    section: "experience",
    title: `Chunk ${ordinal}`,
    entityKeys: [`experience:job-${ordinal}`],
    text: indexText,
    context: null,
    indexText,
    tokenCount: 1,
    embedding,
  };
}

// Counts repository reads, so the tests can see what the cache saves.
class CountingChunks extends MemoryRagChunks {
  reads: string[] = [];

  override listByIndex(indexId: string) {
    this.reads.push(indexId);
    return super.listByIndex(indexId);
  }
}

async function seeded() {
  const repository = new CountingChunks();
  await repository.insertMany(
    [
      chunk(0, "Built payment services with Node.js", [1, 0]),
      chunk(1, "Led a data team using Python", [0, 1]),
      chunk(2, "Python services on Kubernetes", [1, 1]),
    ],
    "idx-1",
  );
  return repository;
}

test("lexical search runs BM25 over the chunks' indexText", async () => {
  const retriever = new InMemoryRetriever(await seeded());

  const hits = await retriever.searchLexical("idx-1", "python services", 5);

  // Chunk 2 matches both terms. Chunks 0 and 1 match one term with the same idf; chunk 1 has
  // 5 terms against chunk 0's 6 (node.js adds node and js), so length normalization favors it.
  expect(hits.map((hit) => [hit.chunkId, hit.rank])).toEqual([
    ["idx-1:2", 1],
    ["idx-1:1", 2],
    ["idx-1:0", 3],
  ]);
});

test("vector search ranks the chunks by cosine similarity", async () => {
  const retriever = new InMemoryRetriever(await seeded());

  const hits = await retriever.searchVector("idx-1", [0, 2], 2);

  expect(hits.map((hit) => hit.chunkId)).toEqual(["idx-1:1", "idx-1:2"]);
  expect(hits[0].score).toBeCloseTo(1, 6);
  expect(hits[1].score).toBeCloseTo(Math.SQRT1_2, 6);
});

test("getChunks returns chunks in the requested order, without embeddings or unknown ids", async () => {
  const retriever = new InMemoryRetriever(await seeded());

  const found = await retriever.getChunks("idx-1", ["idx-1:2", "missing", "idx-1:0"]);

  expect(found.map((item) => item.id)).toEqual(["idx-1:2", "idx-1:0"]);
  expect(found[0]).not.toHaveProperty("embedding");
  expect(found[0]).toEqual({
    id: "idx-1:2",
    indexId: "idx-1",
    ordinal: 2,
    section: "experience",
    title: "Chunk 2",
    entityKeys: ["experience:job-2"],
    text: "Python services on Kubernetes",
    context: null,
    indexText: "Python services on Kubernetes",
    tokenCount: 1,
  });
});

test("returned chunks are copies of the cached ones", async () => {
  const retriever = new InMemoryRetriever(await seeded());

  const [first] = await retriever.getChunks("idx-1", ["idx-1:0"]);
  first.title = "changed";
  first.entityKeys.push("changed");
  const [again] = await retriever.getChunks("idx-1", ["idx-1:0"]);

  expect(again.title).toBe("Chunk 0");
  expect(again.entityKeys).toEqual(["experience:job-0"]);
});

test("a loaded index is read once, including by concurrent searches", async () => {
  const repository = await seeded();
  const retriever = new InMemoryRetriever(repository);

  await Promise.all([
    retriever.searchLexical("idx-1", "python", 3),
    retriever.searchVector("idx-1", [1, 0], 3),
  ]);
  await retriever.getChunks("idx-1", ["idx-1:0"]);

  expect(repository.reads).toEqual(["idx-1"]);
});

test("the cache keeps at most 3 indexes and evicts the least recently used", async () => {
  const repository = new CountingChunks();
  for (const id of ["a", "b", "c", "d"]) {
    await repository.insertMany([chunk(0, `text ${id}`, [1, 0])], id);
  }
  const cache = createSearchIndexCache();
  const retriever = new InMemoryRetriever(repository, { cache });

  for (const id of ["a", "b", "c", "a", "d"]) await retriever.load(id);

  expect(SEARCH_INDEX_CACHE_SIZE).toBe(3);
  expect(cache.keys()).toEqual(["c", "a", "d"]);
  await retriever.load("b");
  expect(repository.reads).toEqual(["a", "b", "c", "d", "b"]);
});

test("an index without chunks fails and is not cached", async () => {
  const repository = new CountingChunks();
  const cache = createSearchIndexCache();
  const retriever = new InMemoryRetriever(repository, { cache });

  const failure = await retriever.searchLexical("empty", "python", 3).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure instanceof EmptySearchIndexError).toBe(true);
  expect(cache.size).toBe(0);

  await repository.insertMany([chunk(0, "python", [1, 0])], "empty");
  expect((await retriever.searchLexical("empty", "python", 3)).length).toBe(1);
});

test("the shared cache is one per process", () => {
  expect(sharedSearchIndexCache()).toBe(sharedSearchIndexCache());
  expect(sharedSearchIndexCache().capacity).toBe(SEARCH_INDEX_CACHE_SIZE);
});
