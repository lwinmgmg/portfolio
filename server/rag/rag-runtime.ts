import "server-only";

import { cache } from "react";
import { after, connection } from "next/server";

import { isDatabaseConfigured } from "@/server/db/client";
import { runTransaction } from "@/server/db/transaction";
import type { CvPublishedListener } from "@/server/domain/cv";
import type { ChunkerKind } from "@/server/domain/rag";
import { readLlmEnv } from "@/server/llm/llm-env";
import { getLlm } from "@/server/llm/llm-runtime";
import { indexConfigFor } from "@/server/rag/indexing/index-config";
import { createRag, type Rag } from "@/server/rag/rag-composition";
import { MongoCvVersionRepository } from "@/server/repositories/cv-version-repository";
import { MongoRagChunkRepository } from "@/server/repositories/rag-chunk-repository";
import { MongoRagIndexRepository } from "@/server/repositories/rag-index-repository";
import { MongoRagSettingsRepository } from "@/server/repositories/rag-settings-repository";
import { MongoRagTraceRepository } from "@/server/repositories/rag-trace-repository";
import type { PlaygroundRequest } from "@/server/services/retrieval-playground-service";

const RAG_INDEX_LIST_LIMIT = 50;

const indexes = new MongoRagIndexRepository();
const chunks = new MongoRagChunkRepository();
const traces = new MongoRagTraceRepository();
const settings = new MongoRagSettingsRepository();
const cvVersions = new MongoCvVersionRepository();

let rag: Rag | null = null;

// Built on first use, not at module init: getLlm() throws when OpenRouter is not configured.
// Other runtimes (chat) reuse it so the process keeps one pipeline and one search cache.
export function getRag(): Rag {
  if (rag) return rag;
  const llm = getLlm();
  rag = createRag(llm.env, {
    llm: llm.client,
    cvVersions,
    indexes,
    chunks,
    traces,
    settings,
    transaction: runTransaction,
  });
  return rag;
}

export function isRagConfigured(): boolean {
  return isDatabaseConfigured() && readLlmEnv() !== null;
}

// The models a new index would use, for the admin build form.
export function ragIndexModels(): { embeddingModel: string; contextModel: string } {
  const { env } = getLlm();
  return { embeddingModel: env.EMBEDDING_MODEL, contextModel: env.LLM_UTILITY_MODEL };
}

export const listRagIndexes = cache(async () => {
  await connection();
  return getRag().indexService.list(RAG_INDEX_LIST_LIMIT);
});

export const getRagIndexWithChunks = cache(async (id: string) => {
  await connection();
  return getRag().indexService.getWithChunks(id);
});

// Returns once the index row exists; the caller runs the job, e.g. with after().
export function startRagIndexBuild(choice: { chunker: ChunkerKind; contextualize: boolean }) {
  const { indexService } = getRag();
  return indexService.startBuild(indexConfigFor(choice, getLlm().env));
}

export function activateRagIndex(id: string) {
  return getRag().indexService.activate(id);
}

export function deleteRagIndex(id: string) {
  return getRag().indexService.delete(id);
}

export function runRetrievalPlayground(request: PlaygroundRequest) {
  return getRag().playground.run(request);
}

export const getChatRetrievalSettings = cache(async () => {
  await connection();
  return getRag().settings.chatSettings();
});

// Every later chat turn uses it. Throws InvalidRetrievalConfigError (a RagError) for a bad config.
export function saveChatRetrievalConfig(config: unknown) {
  return getRag().settings.saveChatConfig(config);
}

// Registered with the CV service. Building an index calls the LLM for every chunk, so it runs
// after the publish response is sent. The route that publishes needs `maxDuration` for it.
export const ragPublishListener: CvPublishedListener = {
  onCvPublished() {
    if (!isRagConfigured()) {
      console.warn("RAG is not configured, so the published CV was not indexed.");
      return Promise.resolve();
    }
    after(async () => {
      try {
        await getRag().indexService.onCvPublished();
      } catch (error) {
        console.error(error);
      }
    });
    return Promise.resolve();
  },
};

export { RagError } from "@/server/domain/rag";
