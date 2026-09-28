import { expect, test } from "bun:test";

import type { TransactionContext } from "@/server/db/transaction";
import {
  CV_PDF_CONTENT_TYPE,
  CV_PDF_MAX_BYTES,
  type BlobBody,
  type BlobHead,
  type BlobStore,
} from "@/server/domain/blob-store";
import {
  CvVersionNotFoundError,
  CvVersionStateError,
  type CvData,
  type CvExtractor,
  type CvPdf,
  type CvPublishedListener,
  type CvVersion,
  type CvVersionRepository,
} from "@/server/domain/cv";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import {
  canEditCv,
  canPublishCv,
  canRetryExtraction,
  CvService,
  cvUploadConstraints,
  InvalidCvError,
  isExtractionInProgress,
  type CvUploadInput,
} from "@/server/services/cv-service";

class MemoryCvVersions implements CvVersionRepository {
  rows: CvVersion[] = [];
  events: string[] = [];
  patches: Array<Partial<CvVersion["extraction"]>> = [];
  limit: number | null = null;
  private readonly uploadIds = new Set<string>();
  private clock = Date.parse("2026-09-26T00:00:00.000Z");

  ensureReady(): Promise<void> {
    this.events.push("ready");
    return Promise.resolve();
  }

  create(input: { pdf: CvPdf }, tx: TransactionContext): Promise<CvVersion> {
    if (!tx.session) throw new Error("create ran outside a transaction");
    this.events.push("create");
    const version: CvVersion = {
      id: String(this.rows.length + 1),
      status: "draft",
      pdf: input.pdf,
      extraction: {
        status: "pending",
        model: null,
        error: null,
        startedAt: null,
        finishedAt: null,
      },
      data: null,
      createdAt: "2026-09-25T12:00:00.000Z",
      updatedAt: "2026-09-25T12:00:00.000Z",
      publishedAt: null,
    };
    this.uploadIds.add(version.id);
    this.rows.push(version);
    return Promise.resolve(version);
  }

  findByUploadPathname(pathname: string): Promise<CvVersion | null> {
    this.events.push("find");
    return Promise.resolve(
      this.rows.find((row) => row.pdf.pathname === pathname && this.uploadIds.has(row.id)) ?? null,
    );
  }

  countByPdfPathname(pathname: string): Promise<number> {
    this.events.push("count");
    return Promise.resolve(this.rows.filter((row) => row.pdf.pathname === pathname).length);
  }

  createCopy(source: CvVersion, data: CvData): Promise<CvVersion> {
    this.events.push("copy");
    const version: CvVersion = {
      id: `copy-${this.rows.length + 1}`,
      status: "draft",
      pdf: source.pdf,
      extraction: { ...source.extraction, status: "succeeded", error: null },
      data,
      createdAt: this.tick(),
      updatedAt: this.tick(),
      publishedAt: null,
    };
    this.rows.push(version);
    return Promise.resolve(version);
  }

  // Each write gets a later timestamp, like Mongo's updatedAt.
  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private isCurrentRun(row: CvVersion, startedAt: string): boolean {
    return row.extraction.status === "running" && row.extraction.startedAt === startedAt;
  }

  findById(id: string): Promise<CvVersion | null> {
    this.events.push("find-id");
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  findPublished(): Promise<CvVersion | null> {
    return Promise.reject(new Error("findPublished was not expected"));
  }

  list(limit: number): Promise<CvVersion[]> {
    this.limit = limit;
    return Promise.resolve(this.rows.slice(0, limit));
  }

  markExtraction(
    id: string,
    patch: Partial<CvVersion["extraction"]>,
    run?: { startedAt: string },
  ): Promise<void> {
    this.events.push("mark");
    this.patches.push(patch);
    const row = this.rows.find((item) => item.id === id);
    if (row && (!run || this.isCurrentRun(row, run.startedAt))) {
      row.extraction = { ...row.extraction, ...patch };
      row.updatedAt = this.tick();
    }
    return Promise.resolve();
  }

  completeExtraction(
    id: string,
    startedAt: string,
    result: { data: CvData; model: string; finishedAt: string },
  ): Promise<CvVersion | null> {
    this.events.push("complete");
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.status !== "draft" || !this.isCurrentRun(row, startedAt)) {
      return Promise.resolve(null);
    }
    row.data = result.data;
    row.extraction = {
      ...row.extraction,
      status: "succeeded",
      model: result.model,
      error: null,
      finishedAt: result.finishedAt,
    };
    row.updatedAt = this.tick();
    return Promise.resolve(row);
  }

  saveData(id: string, data: CvData, expectedUpdatedAt: string): Promise<CvVersion | null> {
    this.events.push("save");
    const row = this.rows.find((item) => item.id === id);
    const settled = row?.extraction.status === "succeeded" || row?.extraction.status === "failed";
    if (!row || row.status !== "draft" || !settled || row.updatedAt !== expectedUpdatedAt) {
      return Promise.resolve(null);
    }
    row.data = data;
    row.updatedAt = this.tick();
    return Promise.resolve(row);
  }

  publish(id: string, tx: TransactionContext): Promise<CvVersion> {
    if (!tx.session) return Promise.reject(new Error("publish ran outside a transaction"));
    this.events.push("publish");
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.status !== "draft" || row.extraction.status !== "succeeded" || row.data === null) {
      return Promise.reject(new CvVersionStateError("Only a draft with extracted CV data can be published."));
    }
    for (const item of this.rows) {
      if (item.status === "published") item.status = "archived";
    }
    row.status = "published";
    row.publishedAt = "2026-09-25T12:00:00.000Z";
    return Promise.resolve(row);
  }

  deleteDraft(id: string): Promise<boolean> {
    this.events.push("delete");
    const index = this.rows.findIndex((row) => row.id === id && row.status === "draft");
    if (index < 0) return Promise.resolve(false);
    const removed = this.rows[index];
    if (removed) this.uploadIds.delete(removed.id);
    this.rows.splice(index, 1);
    return Promise.resolve(true);
  }
}

class MemoryExtractor implements CvExtractor {
  pdf: Uint8Array | null = null;
  filename: string | null = null;
  result: { data: CvData; model: string } | null = null;
  failure: Error | null = null;

  extract(pdf: Uint8Array, filename: string): Promise<{ data: CvData; model: string }> {
    this.pdf = pdf;
    this.filename = filename;
    if (this.failure) return Promise.reject(this.failure);
    if (!this.result) return Promise.reject(new Error("extract was not expected"));
    return Promise.resolve(this.result);
  }
}

class MemoryBlobs implements BlobStore {
  files = new Map<string, BlobHead>();
  bytes = new Map<string, Uint8Array | null>();
  bodies = new Map<string, BlobBody | null>();
  deleted: string[] = [];
  headError: Error | null = null;
  readError: Error | null = null;
  deleteError: Error | null = null;

  head(pathname: string): Promise<BlobHead | null> {
    if (this.headError) return Promise.reject(this.headError);
    return Promise.resolve(this.files.get(pathname) ?? null);
  }

  read(pathname: string): Promise<BlobBody | null> {
    if (!this.bodies.has(pathname)) return Promise.reject(new Error("read was not expected"));
    return Promise.resolve(this.bodies.get(pathname) ?? null);
  }

  readBytes(pathname: string): Promise<Uint8Array | null> {
    if (this.readError) return Promise.reject(this.readError);
    if (!this.bytes.has(pathname)) return Promise.reject(new Error("readBytes was not expected"));
    return Promise.resolve(this.bytes.get(pathname) ?? null);
  }

  delete(pathname: string): Promise<void> {
    if (this.deleteError) return Promise.reject(this.deleteError);
    this.deleted.push(pathname);
    return Promise.resolve();
  }
}

const now = new Date("2026-09-25T12:00:00.000Z");
const session = {} as TransactionContext["session"];

function setup(head?: BlobHead, listeners: readonly CvPublishedListener[] = []) {
  const versions = new MemoryCvVersions();
  const blobs = new MemoryBlobs();
  if (head) blobs.files.set("cv/resume.pdf", head);
  const transaction = <T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> => {
    versions.events.push("transaction");
    return work({ session });
  };
  const extract = new MemoryExtractor();
  const service = new CvService(versions, blobs, extract, transaction, () => now, listeners);
  return { service, versions, blobs, extract };
}

const pdfHead: BlobHead = { size: 1200, contentType: CV_PDF_CONTENT_TYPE };

async function rejection(work: () => Promise<unknown>): Promise<InvalidCvError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof InvalidCvError) return error;
    throw error;
  }
  throw new Error("Expected InvalidCvError.");
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

test("registerUpload creates a pending draft for a private PDF", async () => {
  const { service, versions } = setup(pdfHead);

  const version = await service.registerUpload({
    pathname: "cv/resume.pdf",
    filename: " Resume.PDF ",
  });

  expect(version.status).toBe("draft");
  expect(version.data).toBeNull();
  expect(version.extraction).toEqual({
    status: "pending",
    model: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  });
  expect(version.pdf).toEqual({
    pathname: "cv/resume.pdf",
    filename: "Resume.PDF",
    size: 1200,
    contentType: "application/pdf",
    uploadedAt: "2026-09-25T12:00:00.000Z",
  });
  expect(versions.events).toEqual(["ready", "find", "transaction", "create"]);
  expect(versions.rows).toEqual([version]);
});

test("registerUpload returns the saved draft on retry without checking the blob again", async () => {
  const { service, versions, blobs } = setup(pdfHead);
  const first = await service.registerUpload({
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
  });
  blobs.headError = new Error("store temporarily unavailable");

  const retry = await service.registerUpload({
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
  });

  expect(retry).toBe(first);
  expect(versions.rows.length).toBe(1);
  expect(versions.events).toEqual([
    "ready", "find", "transaction", "create",
    "ready", "find",
  ]);
});

test("registerUpload reads the saved draft after an upload-key write error", async () => {
  const { versions, blobs } = setup(pdfHead);
  const duplicatePath = Object.assign(new Error("duplicate key"), {
    code: 11000,
    keyPattern: { uploadPathname: 1 },
  });
  const transaction = async <T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> => {
    await work({ session });
    throw duplicatePath;
  };
  const service = new CvService(versions, blobs, new MemoryExtractor(), transaction, () => now);

  const version = await service.registerUpload({
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
  });

  expect(version).toBe(versions.rows[0]);
  expect(versions.events).toEqual(["ready", "find", "create", "find"]);
});

test("registerUpload reads the saved draft after a duplicate-path write error", async () => {
  const { versions, blobs } = setup(pdfHead);
  const duplicatePath = Object.assign(new Error("duplicate key"), {
    code: 11000,
    keyPattern: { "pdf.pathname": 1 },
  });
  const transaction = async <T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> => {
    await work({ session });
    throw duplicatePath;
  };
  const service = new CvService(versions, blobs, new MemoryExtractor(), transaction, () => now);

  const version = await service.registerUpload({
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
  });

  expect(version).toBe(versions.rows[0]);
  expect(versions.events).toEqual(["ready", "find", "create", "find"]);
});

test("registerUpload rethrows a duplicate-path error when no draft was saved", async () => {
  const { versions, blobs } = setup(pdfHead);
  const duplicatePath = Object.assign(new Error("duplicate key"), {
    code: 11000,
    keyPattern: { "pdf.pathname": 1 },
  });
  const transaction = async <T>(): Promise<T> => {
    throw duplicatePath;
  };
  const service = new CvService(versions, blobs, new MemoryExtractor(), transaction, () => now);

  let caught: unknown;
  try {
    await service.registerUpload({
      pathname: "cv/resume.pdf",
      filename: "resume.pdf",
    });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBe(duplicatePath);
  expect(versions.events).toEqual(["ready", "find", "find"]);
});

test("registerUpload reads the saved draft after an uncertain commit", async () => {
  const { versions, blobs } = setup(pdfHead);
  const uncertainCommit = Object.assign(new Error("commit response lost"), {
    hasErrorLabel: (label: string) => label === "UnknownTransactionCommitResult",
  });
  const transaction = async <T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> => {
    await work({ session });
    throw uncertainCommit;
  };
  const service = new CvService(versions, blobs, new MemoryExtractor(), transaction, () => now);

  const version = await service.registerUpload({
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
  });

  expect(version).toBe(versions.rows[0]);
  expect(versions.events).toEqual(["ready", "find", "create", "find"]);
});

test("registerUpload preserves unrelated write errors", async () => {
  const { versions, blobs } = setup(pdfHead);
  const unrelated = Object.assign(new Error("another unique index failed"), {
    code: 11000,
    keyPattern: { status: 1 },
  });
  const transaction = async <T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> => {
    await work({ session });
    throw unrelated;
  };
  const service = new CvService(versions, blobs, new MemoryExtractor(), transaction, () => now);

  let caught: unknown;
  try {
    await service.registerUpload({
      pathname: "cv/resume.pdf",
      filename: "resume.pdf",
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(unrelated);
  expect(versions.events).toEqual(["ready", "find", "create"]);
});

test("registerUpload accepts a 10 MB PDF and a content type with parameters", async () => {
  const { service, blobs } = setup();
  blobs.files.set("cv/resume.PDF", {
    size: CV_PDF_MAX_BYTES,
    contentType: "Application/PDF; charset=binary",
  });

  const version = await service.registerUpload({
    pathname: "cv/resume.PDF",
    filename: "resume.PDF",
  });

  expect(version.pdf.size).toBe(CV_PDF_MAX_BYTES);
  expect(version.pdf.pathname).toBe("cv/resume.PDF");
  expect(version.pdf.contentType).toBe("application/pdf");
});

test("registerUpload rejects a missing, oversized, or non-PDF blob before writing", async () => {
  const cases: Array<{
    input: CvUploadInput;
    head: BlobHead | null;
    message: string;
  }> = [
    {
      input: { pathname: "notes.pdf", filename: "notes.pdf" },
      head: pdfHead,
      message: "The PDF must be stored at a cv/ path.",
    },
    {
      input: { pathname: "cv/nested/resume.pdf", filename: "resume.pdf" },
      head: pdfHead,
      message: "The PDF must be stored at a cv/ path.",
    },
    {
      input: { pathname: "cv/../resume.pdf", filename: "resume.pdf" },
      head: pdfHead,
      message: "The PDF must be stored at a cv/ path.",
    },
    {
      input: { pathname: "cv/resume.txt", filename: "resume.pdf" },
      head: pdfHead,
      message: "The PDF must be stored at a cv/ path.",
    },
    {
      input: { pathname: "cv/resume.pdf", filename: "resume.txt" },
      head: pdfHead,
      message: "The file name must end with .pdf.",
    },
    {
      input: { pathname: "cv/resume.pdf", filename: "../resume.pdf" },
      head: pdfHead,
      message: "The file name must end with .pdf.",
    },
    {
      input: { pathname: "cv/resume.pdf", filename: "resume.pdf" },
      head: null,
      message: "The uploaded PDF was not found.",
    },
    {
      input: { pathname: "cv/resume.pdf", filename: "resume.pdf" },
      head: { size: CV_PDF_MAX_BYTES + 1, contentType: CV_PDF_CONTENT_TYPE },
      message: "The PDF must be 10 MB or smaller.",
    },
    {
      input: { pathname: "cv/resume.pdf", filename: "resume.pdf" },
      head: { size: 10, contentType: "text/plain" },
      message: "The uploaded file must be a PDF.",
    },
  ];

  for (const item of cases) {
    const { service, versions, blobs } = setup();
    if (item.head) blobs.files.set(item.input.pathname, item.head);
    const error = await rejection(() => service.registerUpload(item.input));
    expect(error.message).toBe(item.message);
    expect(versions.rows.length).toBe(0);
    expect(versions.events.includes("create")).toBe(false);
    expect(versions.events.includes("transaction")).toBe(false);
  }
});

test("registerUpload turns a blob lookup failure into InvalidCvError", async () => {
  const { service, blobs, versions } = setup();
  blobs.headError = new Error("store unavailable");

  const error = await rejection(() =>
    service.registerUpload({ pathname: "cv/resume.pdf", filename: "resume.pdf" }),
  );

  expect(error.message).toBe("The uploaded PDF could not be verified.");
  expect(error.cause).toBe(blobs.headError);
  expect(versions.events).toEqual(["ready", "find"]);
});

test("cvUploadConstraints allows only a cv PDF and a 10 MB private upload", () => {
  expect(cvUploadConstraints("cv/My Resume.pdf")).toEqual({
    allowedContentTypes: ["application/pdf"],
    maximumSizeInBytes: CV_PDF_MAX_BYTES,
    addRandomSuffix: true,
  });
});

test("cvUploadConstraints rejects a non-PDF path", async () => {
  const error = await rejection(() => Promise.resolve(cvUploadConstraints("cv/notes.txt")));
  expect(error.message).toBe("The PDF must be stored at a cv/ path.");
});

test("list asks the repository for the requested limit", async () => {
  const { service, versions } = setup(pdfHead);
  await service.registerUpload({ pathname: "cv/resume.pdf", filename: "resume.pdf" });

  const rows = await service.list(1);

  expect(versions.limit).toBe(1);
  expect(rows.length).toBe(1);
  expect((await rejection(() => Promise.resolve(service.list(0)))).message).toBe(
    "The version list limit must be a positive integer.",
  );
});

const pdfBytes = Uint8Array.from([37, 80, 68, 70]);
const fiveMinutes = 5 * 60 * 1000;

function draft(
  extraction: Partial<CvVersion["extraction"]> = {},
  status: CvVersion["status"] = "draft",
): CvVersion {
  return {
    id: "cv-1",
    status,
    pdf: {
      pathname: "cv/resume.pdf",
      filename: "resume.pdf",
      size: pdfBytes.byteLength,
      contentType: "application/pdf",
      uploadedAt: now.toISOString(),
    },
    extraction: {
      status: "pending",
      model: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      ...extraction,
    },
    data: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    publishedAt: null,
  };
}

test("runExtraction stores extracted CV data for a pending draft", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft());
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: " deepseek/deepseek-v4.1-flash " };

  await service.runExtraction("cv-1");

  expect(Array.from(extract.pdf ?? [])).toEqual(Array.from(pdfBytes));
  expect(extract.filename).toBe("resume.pdf");
  expect(versions.events).toEqual(["find-id", "mark", "complete"]);
  expect(versions.patches[0]).toEqual({
    status: "running",
    error: null,
    startedAt: now.toISOString(),
    finishedAt: null,
  });
  expect(versions.rows[0]?.data).toEqual(sampleCv);
  expect(versions.rows[0]?.extraction).toEqual({
    status: "succeeded",
    model: "deepseek/deepseek-v4.1-flash",
    error: null,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
  });
});

test("runExtraction marks a failed draft and retries it", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(
    draft({ status: "failed", error: "previous failure", finishedAt: now.toISOString() }),
  );
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: "extract-model" };

  await service.runExtraction("cv-1");

  expect(versions.rows[0]?.extraction.status).toBe("succeeded");
  expect(versions.rows[0]?.extraction.error).toBeNull();
  expect(versions.rows[0]?.extraction.model).toBe("extract-model");
});

test("runExtraction records a truncated provider error and reports it", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft());
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  const failure = new Error("x".repeat(600));
  extract.failure = failure;

  const error = await rejection(() => service.runExtraction("cv-1"));

  expect(error.message).toBe("x".repeat(500));
  expect(error.cause).toBe(failure);
  expect(versions.rows[0]?.data).toBeNull();
  expect(versions.rows[0]?.extraction.status).toBe("failed");
  expect(versions.rows[0]?.extraction.error).toBe("x".repeat(500));
  expect(versions.rows[0]?.extraction.finishedAt).toBe(now.toISOString());
  expect(versions.patches[0]?.status).toBe("running");
});

test("runExtraction marks a missing PDF as failed", async () => {
  const { service, versions, blobs } = setup();
  versions.rows.push(draft());
  blobs.bytes.set("cv/resume.pdf", null);

  const error = await rejection(() => service.runExtraction("cv-1"));

  expect(error.message).toBe("The uploaded PDF was not found.");
  expect(versions.rows[0]?.extraction.status).toBe("failed");
  expect(versions.rows[0]?.extraction.error).toBe("The uploaded PDF was not found.");
  expect(versions.events.includes("complete")).toBe(false);
});

test("runExtraction does not overwrite a newer run that started meanwhile", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft());
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  const newerRun = "2026-09-25T12:03:00.000Z";
  extract.extract = () => {
    // A retry takes over while this run waits on the model.
    const row = versions.rows[0];
    if (row) row.extraction = { ...row.extraction, startedAt: newerRun };
    return Promise.resolve({ data: sampleCv, model: "extract-model" });
  };

  const error = await rejectionOf(CvVersionStateError, () => service.runExtraction("cv-1"));

  expect(error.message).toBe("The CV draft changed while extraction was running.");
  expect(versions.rows[0]?.data).toBeNull();
  expect(versions.rows[0]?.extraction.status).toBe("running");
  expect(versions.rows[0]?.extraction.startedAt).toBe(newerRun);
});

test("runExtraction rejects a fresh running draft before reading the PDF", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft({ status: "running", startedAt: now.toISOString() }));
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: "extract-model" };

  const error = await rejectionOf(CvVersionStateError, () => service.runExtraction("cv-1"));

  expect(error.message).toBe("Extraction is already running.");
  expect(versions.patches.length).toBe(0);
  expect(extract.filename).toBeNull();
});

test("runExtraction allows a running draft once it is five minutes old", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(
    draft({
      status: "running",
      startedAt: new Date(now.getTime() - fiveMinutes).toISOString(),
    }),
  );
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: "extract-model" };

  await service.runExtraction("cv-1");

  expect(versions.rows[0]?.extraction.status).toBe("succeeded");
});

test("runExtraction keeps a draft that has been running for just under five minutes", async () => {
  const { service, versions } = setup();
  versions.rows.push(
    draft({
      status: "running",
      startedAt: new Date(now.getTime() - fiveMinutes + 1).toISOString(),
    }),
  );

  const error = await rejectionOf(CvVersionStateError, () => service.runExtraction("cv-1"));

  expect(error.message).toBe("Extraction is already running.");
  expect(versions.patches.length).toBe(0);
});

test("runExtraction allows a running draft with no start time", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft({ status: "running", startedAt: null }));
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: "extract-model" };

  await service.runExtraction("cv-1");

  expect(versions.rows[0]?.extraction.status).toBe("succeeded");
});

test("runExtraction rejects succeeded, published, and missing versions before writing", async () => {
  const succeeded = setup();
  succeeded.versions.rows.push(draft({ status: "succeeded", model: "extract-model" }));
  const succeededError = await rejectionOf(CvVersionStateError, () =>
    succeeded.service.runExtraction("cv-1"),
  );
  expect(succeededError.message).toBe("Extraction has already succeeded.");

  const published = setup();
  published.versions.rows.push(draft({ status: "pending" }, "published"));
  const publishedError = await rejectionOf(CvVersionStateError, () =>
    published.service.runExtraction("cv-1"),
  );
  expect(publishedError.message).toBe("Extraction is only available for a draft.");

  const missing = setup();
  const missingError = await rejectionOf(CvVersionNotFoundError, () =>
    missing.service.runExtraction("missing"),
  );
  expect(missingError.message).toBe('CV version "missing" was not found.');

  expect(succeeded.versions.patches.length).toBe(0);
  expect(published.versions.patches.length).toBe(0);
  expect(missing.versions.events).toEqual(["find-id"]);
});

test("runExtraction rejects a blank model after reading the PDF", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft());
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: "  " };

  const error = await rejection(() => service.runExtraction("cv-1"));

  expect(error.message).toBe("Extraction did not report a model.");
  expect(versions.rows[0]?.extraction.status).toBe("failed");
  expect(versions.events.includes("complete")).toBe(false);
});

test("in-progress and retry helpers follow the five-minute running window", () => {
  const pending = draft();
  const fresh = draft({ status: "running", startedAt: now.toISOString() });
  const stale = draft({
    status: "running",
    startedAt: new Date(now.getTime() - fiveMinutes).toISOString(),
  });
  const failed = draft({ status: "failed", error: "model down" });
  const published = draft({ status: "failed", error: "model down" }, "published");

  expect(isExtractionInProgress(pending, now)).toBe(true);
  expect(isExtractionInProgress(fresh, now)).toBe(true);
  expect(isExtractionInProgress(stale, now)).toBe(false);
  expect(canRetryExtraction(failed, now)).toBe(true);
  expect(canRetryExtraction(stale, now)).toBe(true);
  expect(canRetryExtraction(fresh, now)).toBe(false);
  expect(canRetryExtraction(published, now)).toBe(false);
});

// The updatedAt the editor loaded for a readyDraft.
const loaded = now.toISOString();

function readyDraft(id: string, status: CvVersion["status"] = "draft"): CvVersion {
  return {
    ...draft({ status: "succeeded", model: "extract-model", finishedAt: now.toISOString() }, status),
    id,
    data: sampleCv,
  };
}

test("saveDraft stores validated CV data and drops blank list lines", async () => {
  const { service, versions } = setup();
  versions.rows.push(readyDraft("cv-1"));
  const input = structuredClone(sampleCv);
  input.profile.headline = "Staff Engineer";
  input.experience[0]?.highlights.push("  ");

  const saved = await service.saveDraft("cv-1", input, loaded);

  expect(saved.data?.profile.headline).toBe("Staff Engineer");
  expect(saved.data?.experience[0]?.highlights).toEqual(sampleCv.experience[0]?.highlights);
  expect(versions.events).toEqual(["find-id", "save"]);
});

test("saveDraft rejects an edit made from an outdated copy of the draft", async () => {
  const { service, versions } = setup();
  versions.rows.push(readyDraft("cv-1"));
  const first = structuredClone(sampleCv);
  first.profile.headline = "First tab";
  await service.saveDraft("cv-1", first, loaded);

  const second = structuredClone(sampleCv);
  second.profile.headline = "Second tab";
  const error = await rejectionOf(CvVersionStateError, () =>
    service.saveDraft("cv-1", second, loaded),
  );

  expect(error.message).toBe(
    "This draft changed after you opened it. Reload the page to see the latest version.",
  );
  expect(versions.rows[0]?.data?.profile.headline).toBe("First tab");
});

test("saveDraft refuses an edit while a retried extraction is running", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft({ status: "failed", error: "model down" }));
  const row = versions.rows[0];
  if (!row) throw new Error("fixture");
  row.data = sampleCv;
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  const edited = structuredClone(sampleCv);
  edited.profile.headline = "Edited by the admin";
  extract.extract = async () => {
    // The admin saves from a page loaded before the retry. The run owns the draft now,
    // so the save is refused instead of being overwritten when the run completes.
    await expect(service.saveDraft("cv-1", edited, row.updatedAt)).rejects.toBeInstanceOf(
      CvVersionStateError,
    );
    return { data: sampleCv, model: "extract-model" };
  };

  await service.runExtraction("cv-1");

  expect(row.extraction.status).toBe("succeeded");
  expect(versions.events.filter((event) => event === "save")).toEqual([]);
});

test("saveDraft fills a blank id and rejects a duplicate id before writing", async () => {
  const filled = setup();
  filled.versions.rows.push(readyDraft("cv-1"));
  const blank = structuredClone(sampleCv);
  const experience = blank.experience[0];
  if (!experience) throw new Error("fixture");
  experience.id = " ";
  const saved = await filled.service.saveDraft("cv-1", blank, loaded);
  expect(saved.data?.experience[0]?.id).not.toBe(" ");
  expect((saved.data?.experience[0]?.id.length ?? 0) > 0).toBe(true);

  const duplicated = setup();
  duplicated.versions.rows.push(readyDraft("cv-1"));
  const input = structuredClone(sampleCv);
  const first = input.experience[0];
  if (!first) throw new Error("fixture");
  input.experience.push({ ...first });
  const error = await rejection(() => duplicated.service.saveDraft("cv-1", input, loaded));
  expect(error.message.startsWith("Duplicate CV entity key")).toBe(true);
  expect(error.issues.length).toBe(1);
  expect(duplicated.versions.events.includes("save")).toBe(false);
});

test("saveDraft rejects invalid data, a published version, and any running extraction", async () => {
  const invalid = setup();
  invalid.versions.rows.push(readyDraft("cv-1"));
  const invalidError = await rejection(() =>
    invalid.service.saveDraft("cv-1", { profile: {} }, loaded),
  );
  expect(invalidError.message).toBe("The CV data is invalid.");
  expect(invalidError.issues.length > 0).toBe(true);
  expect(invalid.versions.events).toEqual(["find-id"]);

  const published = setup();
  published.versions.rows.push(readyDraft("cv-1", "published"));
  const publishedError = await rejectionOf(CvVersionStateError, () =>
    published.service.saveDraft("cv-1", sampleCv, loaded),
  );
  expect(publishedError.message).toBe("Only a draft can be edited.");

  // A stale run may still finish, so it blocks edits the same way a fresh one does.
  for (const startedAt of [now, new Date(now.getTime() - fiveMinutes)]) {
    const running = setup();
    running.versions.rows.push(readyDraft("cv-1"));
    const row = running.versions.rows[0];
    if (!row) throw new Error("fixture");
    row.extraction = { ...row.extraction, status: "running", startedAt: startedAt.toISOString() };
    const runningError = await rejectionOf(CvVersionStateError, () =>
      running.service.saveDraft("cv-1", sampleCv, loaded),
    );
    expect(runningError.message).toBe("Wait for extraction to finish before editing.");
    expect(running.versions.events.includes("save")).toBe(false);
  }
});

test("canEditCv and canPublishCv follow the draft and extraction state", () => {
  const ready = readyDraft("cv-1");
  const failedWithData = { ...draft({ status: "failed", error: "model down" }), data: sampleCv };
  const staleRunning = {
    ...draft({ status: "running", startedAt: new Date(now.getTime() - fiveMinutes).toISOString() }),
    data: sampleCv,
  };

  expect(canEditCv(ready)).toBe(true);
  expect(canEditCv(failedWithData)).toBe(true);
  expect(canEditCv(staleRunning)).toBe(false);
  expect(canEditCv(readyDraft("cv-1", "published"))).toBe(false);
  expect(canEditCv(draft({ status: "failed" }))).toBe(false);

  expect(canPublishCv(ready)).toBe(true);
  expect(canPublishCv(failedWithData)).toBe(false);
  expect(canPublishCv(readyDraft("cv-1", "archived"))).toBe(false);
});

test("publish promotes one draft and archives the previous published version", async () => {
  const seen: string[] = [];
  const { service, versions } = setup(undefined, [
    {
      onCvPublished(version) {
        seen.push(version.id);
        return Promise.resolve();
      },
    },
  ]);
  versions.rows.push(readyDraft("cv-1"), readyDraft("cv-2"));

  await service.publish("cv-1");
  await service.publish("cv-2");

  expect(versions.rows.find((row) => row.id === "cv-1")?.status).toBe("archived");
  expect(versions.rows.find((row) => row.id === "cv-2")?.status).toBe("published");
  expect(versions.rows.filter((row) => row.status === "published").length).toBe(1);
  expect(seen).toEqual(["cv-1", "cv-2"]);
  expect(versions.events).toEqual([
    "find-id", "ready", "transaction", "publish",
    "find-id", "ready", "transaction", "publish",
  ]);
});

test("publish logs a listener failure and still returns the published version", async () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args[0]);
  };
  const { service, versions } = setup(undefined, [
    {
      onCvPublished() {
        return Promise.reject(new Error("index failed"));
      },
    },
  ]);
  versions.rows.push(readyDraft("cv-1"));

  try {
    const published = await service.publish("cv-1");
    expect(published.status).toBe("published");
    expect(logged[0] instanceof Error).toBe(true);
  } finally {
    console.error = original;
  }
});

test("publish rejects a draft that is not ready and a missing version before writing", async () => {
  const unfinished = setup();
  const unfinishedDraft = draft();
  unfinishedDraft.data = sampleCv;
  unfinished.versions.rows.push(unfinishedDraft);
  const unfinishedError = await rejectionOf(CvVersionStateError, () =>
    unfinished.service.publish("cv-1"),
  );
  expect(unfinishedError.message).toBe("Only a draft with extracted CV data can be published.");

  const missing = setup();
  const missingError = await rejectionOf(CvVersionNotFoundError, () =>
    missing.service.publish("missing"),
  );
  expect(missingError.message).toBe('CV version "missing" was not found.');
  expect(unfinished.versions.events.includes("transaction")).toBe(false);
  expect(missing.versions.events).toEqual(["find-id"]);
});

test("duplicateAsDraft copies the PDF and data into a new succeeded draft", async () => {
  const { service, versions } = setup();
  versions.rows.push(readyDraft("cv-1", "published"));

  const copy = await service.duplicateAsDraft("cv-1");

  expect(copy.id).not.toBe("cv-1");
  expect(copy.status).toBe("draft");
  expect(copy.pdf).toEqual(versions.rows[0]?.pdf);
  expect(copy.data).toEqual(sampleCv);
  expect(copy.extraction.status).toBe("succeeded");
  expect(copy.extraction.model).toBe("extract-model");
  expect(copy.extraction.finishedAt).toBe(versions.rows[0]?.extraction.finishedAt ?? "missing");
  expect(versions.rows[0]?.status).toBe("published");
  expect(versions.rows.filter((row) => row.pdf.pathname === "cv/resume.pdf").length).toBe(2);
});

test("duplicateAsDraft rejects a version that has no CV data", async () => {
  const { service, versions } = setup();
  versions.rows.push(draft({ status: "failed", error: "model down" }));

  const error = await rejectionOf(CvVersionStateError, () => service.duplicateAsDraft("cv-1"));

  expect(error.message).toBe("A version needs CV data before it can be duplicated.");
  expect(versions.events.includes("copy")).toBe(false);
});

test("deleteDraft removes the PDF only when no other version references it", async () => {
  const shared = setup();
  shared.versions.rows.push(readyDraft("cv-1"), readyDraft("cv-2", "published"));
  await shared.service.deleteDraft("cv-1");
  expect(shared.versions.rows.map((row) => row.id)).toEqual(["cv-2"]);
  expect(shared.blobs.deleted).toEqual([]);

  const last = setup();
  last.versions.rows.push(readyDraft("cv-1"));
  await last.service.deleteDraft("cv-1");
  expect(last.versions.rows).toEqual([]);
  expect(last.blobs.deleted).toEqual(["cv/resume.pdf"]);
});

test("deleteDraft keeps the draft removed when the PDF deletion fails", async () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (error: unknown) => {
    logged.push(error);
  };
  const { service, versions, blobs } = setup();
  versions.rows.push(readyDraft("cv-1"));
  blobs.deleteError = new Error("blob store unavailable");

  try {
    await service.deleteDraft("cv-1");
  } finally {
    console.error = original;
  }

  expect(versions.rows).toEqual([]);
  expect(logged[0]).toBe(blobs.deleteError);
});

test("deleteDraft rejects a published version before deleting the PDF", async () => {
  const { service, versions, blobs } = setup();
  versions.rows.push(readyDraft("cv-1", "published"));

  const error = await rejectionOf(CvVersionStateError, () => service.deleteDraft("cv-1"));

  expect(error.message).toBe("Only a draft can be deleted.");
  expect(versions.rows.length).toBe(1);
  expect(blobs.deleted).toEqual([]);
});

test("openPdf returns the stored stream and nothing for a missing version", async () => {
  const { service, versions, blobs } = setup();
  versions.rows.push(readyDraft("cv-1"));
  const body = { stream: new ReadableStream<Uint8Array>(), size: 4 };
  blobs.bodies.set("cv/resume.pdf", body);

  const opened = await service.openPdf("cv-1");
  expect(opened?.stream).toBe(body.stream);
  expect(opened?.size).toBe(4);
  expect(opened?.filename).toBe("resume.pdf");
  expect(await service.openPdf("missing")).toBeNull();

  blobs.bodies.set("cv/resume.pdf", null);
  expect(await service.openPdf("cv-1")).toBeNull();
});
