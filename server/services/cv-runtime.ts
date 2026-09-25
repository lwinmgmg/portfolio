import "server-only";

import { cache } from "react";
import { connection } from "next/server";

import { LlmCvExtractor } from "@/server/cv/cv-extractor";
import { runTransaction } from "@/server/db/transaction";
import type { CvExtractor } from "@/server/domain/cv";
import { readLlmEnv } from "@/server/llm/llm-env";
import { getLlm } from "@/server/llm/llm-runtime";
import { MongoCvVersionRepository } from "@/server/repositories/cv-version-repository";
import { VercelBlobStore } from "@/server/storage/vercel-blob-store";
import { CvService, type CvUploadInput } from "@/server/services/cv-service";

const CV_VERSION_LIST_LIMIT = 50;

const cvExtractor: CvExtractor = {
  extract(pdf, filename) {
    const llm = getLlm();
    return new LlmCvExtractor(
      llm.client,
      llm.env.LLM_EXTRACT_MODEL,
      llm.env.LLM_PDF_ENGINE,
    ).extract(pdf, filename);
  },
};

const cvService = new CvService(
  new MongoCvVersionRepository(),
  new VercelBlobStore(),
  cvExtractor,
  runTransaction,
);

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isExtractionConfigured(): boolean {
  return readLlmEnv() !== null;
}

export const listCvVersions = cache(async () => {
  await connection();
  return cvService.list(CV_VERSION_LIST_LIMIT);
});

export function registerCvUpload(input: CvUploadInput) {
  return cvService.registerUpload(input);
}

export function runExtraction(versionId: string): Promise<void> {
  return cvService.runExtraction(versionId);
}

export { InvalidCvError } from "@/server/services/cv-service";
