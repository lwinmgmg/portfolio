import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { CvVersion } from "@/server/domain/cv";
import type { ChatRequest } from "@/server/domain/llm";
import { readLlmEnv } from "@/server/llm/llm-env";
import {
  fakeTransaction,
  MemoryRagChunks,
  MemoryRagIndexes,
} from "@/server/rag/__fixtures__/memory-rag-repositories";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import { TokenWindowChunker } from "@/server/rag/chunking/token-window-chunker";
import { createRag } from "@/server/rag/rag-composition";

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
  const indexes = new MemoryRagIndexes();
  const chunks = new MemoryRagChunks();
  const rag = createRag(
    envWith({ EMBEDDING_MODEL: "embed-x", LLM_UTILITY_MODEL: "utility-x" }),
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
      },
      cvVersions: { findPublished: async () => published },
      indexes,
      chunks,
      transaction: fakeTransaction,
      now: () => new Date(at),
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
});
