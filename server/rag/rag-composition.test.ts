import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { CvVersion } from "@/server/domain/cv";
import type { ChatRequest } from "@/server/domain/llm";
import type { RetrievalTrace } from "@/server/domain/rag";
import { readLlmEnv } from "@/server/llm/llm-env";
import {
  fakeTransaction,
  MemoryRagChunks,
  MemoryRagIndexes,
  MemoryRagSettings,
} from "@/server/rag/__fixtures__/memory-rag-repositories";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import { TokenWindowChunker } from "@/server/rag/chunking/token-window-chunker";
import { RETRIEVAL_PRESETS } from "@/server/rag/pipeline/retrieval-config";
import { createRag } from "@/server/rag/rag-composition";
import { createSearchIndexCache } from "@/server/rag/search/in-memory-retriever";

const at = "2026-09-28T00:00:00.000Z";

const published: CvVersion = {
  id: "cv-9",
  status: "published",
  pdf: {
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
    size: 1,
    contentType: "application/pdf",
    uploadedAt: at,
  },
  extraction: { status: "succeeded", model: "m", error: null, startedAt: at, finishedAt: at },
  data: sampleCv,
  createdAt: at,
  updatedAt: at,
  publishedAt: at,
};

function envWith(models: Record<string, string>) {
  const env = readLlmEnv({ OPENROUTER_API_KEY: "key", ...models });
  if (!env) throw new Error("expected a valid env");
  return env;
}

test("the composed pipeline builds and activates the default index from the published CV", async () => {
  const requests: ChatRequest[] = [];
  const embeddedModels: string[] = [];
  const rerankModels: string[] = [];
  const indexes = new MemoryRagIndexes();
  const chunks = new MemoryRagChunks();
  const traces: RetrievalTrace[] = [];
  const settings = new MemoryRagSettings();
  const rag = createRag(
    envWith({ EMBEDDING_MODEL: "embed-x", LLM_UTILITY_MODEL: "utility-x", RERANK_MODEL: "rerank-x" }),
    {
      llm: {
        complete: async (request) => {
          requests.push(request);
          return { text: "Situating context.", usage: null, model: request.model };
        },
        stream: () => {
          throw new Error("not used");
        },
        embed: async ({ model, texts }) => {
          embeddedModels.push(model);
          return { vectors: texts.map(() => [1, 1]), usage: null };
        },
        rerank: async ({ model, documents }) => {
          rerankModels.push(model);
          return documents.map((_document, index) => ({ index, score: 1 - index / 10 }));
        },
      },
      cvVersions: { findPublished: async () => published },
      indexes,
      chunks,
      traces: {
        save: async (trace) => {
          traces.push(trace);
        },
      },
      settings,
      transaction: fakeTransaction,
      now: () => new Date(at),
      searchCache: createSearchIndexCache(),
    },
  );

  expect(rag.defaultIndexConfig).toEqual({
    chunker: "structured",
    contextualize: true,
    embeddingModel: "embed-x",
    contextModel: "utility-x",
  });
  expect(rag.chunkers.structured instanceof StructuredCvChunker).toBe(true);
  expect(rag.chunkers["token-window"] instanceof TokenWindowChunker).toBe(true);

  await rag.indexService.onCvPublished();

  const active = await indexes.findActive();
  expect(active?.sourceId).toBe("cv-9");
  const stored = await chunks.listByIndex(active?.id ?? "");
  expect(stored.length).toBe(requests.length);
  expect(requests.every((request) => request.model === "utility-x")).toBe(true);
  expect(embeddedModels.every((model) => model === "embed-x")).toBe(true);
  expect(stored.every((chunk) => chunk.context === "Situating context.")).toBe(true);

  const hits = await rag.retriever.searchVector(active?.id ?? "", [1, 1], 3);
  expect(hits.length).toBe(Math.min(3, stored.length));
  expect(hits[0].score).toBeCloseTo(1, 6);

  // The fake reply is not rewrite JSON, so the rewriter falls back, but it used the utility model.
  const rewrite = await rag.queryRewriter.rewrite({
    message: "Skills?",
    history: [],
    mode: "standalone",
    subjectName: "Jane Doe",
  });
  expect(rewrite.queries).toEqual(["Skills?"]);
  expect(requests.at(-1)?.model).toBe("utility-x");
  expect(requests.at(-1)?.jsonSchema?.name).toBe("query_rewrite");

  const reranked = await rag.reranker.rerank(
    "Skills?",
    stored.slice(0, 2).map((chunk) => ({ chunkId: chunk.id, text: chunk.indexText })),
    2,
  );
  expect(rerankModels).toEqual(["rerank-x"]);
  expect(reranked.fallback).toBe(false);
  expect(reranked.hits.map((hit) => hit.chunkId)).toEqual(stored.slice(0, 2).map((chunk) => chunk.id));

  // The playground runs the composed pipeline against the active index and saves its trace.
  const run = await rag.playground.run({
    message: "Skills?",
    history: [],
    // Without the mean cut, so every reranked hit becomes a source.
    config: { ...RETRIEVAL_PRESETS["hybrid-rerank"], dropBelowMeanRerank: false },
    indexId: null,
  });
  expect(run.error).toBeNull();
  expect(run.saved).toBe(true);
  expect(traces.map((trace) => trace.id)).toEqual([run.trace.id]);
  expect(run.trace.indexId).toBe(active?.id ?? "");
  expect(run.trace.stages.map((stage) => stage.name)).toEqual([
    "rewrite",
    "embed-queries",
    "vector-search",
    "lexical-search",
    "fuse",
    "rerank",
    "filter",
  ]);
  expect(run.trace.sources.length).toBe(Math.min(5, stored.length));
  expect(embeddedModels.at(-1)).toBe("embed-x");
  expect(rerankModels.at(-1)).toBe("rerank-x");

  // The chat config is saved through the injected settings repository, stamped with `now`.
  await rag.settings.saveChatConfig(RETRIEVAL_PRESETS["hybrid-rerank"]);
  expect(settings.chat).toEqual({ config: RETRIEVAL_PRESETS["hybrid-rerank"], updatedAt: at });
});
