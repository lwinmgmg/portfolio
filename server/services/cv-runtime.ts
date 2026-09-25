import "server-only";

import { cache } from "react";
import { connection } from "next/server";

import { runTransaction } from "@/server/db/transaction";
import { MongoCvVersionRepository } from "@/server/repositories/cv-version-repository";
import { VercelBlobStore } from "@/server/storage/vercel-blob-store";
import { CvService, type CvUploadInput } from "@/server/services/cv-service";

const CV_VERSION_LIST_LIMIT = 50;

const cvService = new CvService(
  new MongoCvVersionRepository(),
  new VercelBlobStore(),
  runTransaction,
);

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export const listCvVersions = cache(async () => {
  await connection();
  return cvService.list(CV_VERSION_LIST_LIMIT);
});

export function registerCvUpload(input: CvUploadInput) {
  return cvService.registerUpload(input);
}

export { InvalidCvError } from "@/server/services/cv-service";
