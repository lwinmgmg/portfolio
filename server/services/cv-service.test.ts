import { expect, test } from "bun:test";

import type { TransactionContext } from "@/server/db/transaction";
import {
  CV_PDF_CONTENT_TYPE,
  CV_PDF_MAX_BYTES,
  type BlobHead,
  type BlobStore,
} from "@/server/domain/blob-store";
import type { CvData, CvExtractor, CvPdf, CvVersion, CvVersionRepository } from "@/server/domain/cv";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import {
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
    this.rows.push(version);
    return Promise.resolve(version);
  }

  findByPdfPathname(pathname: string): Promise<CvVersion | null> {
    this.events.push("find");
    return Promise.resolve(this.rows.find((row) => row.pdf.pathname === pathname) ?? null);
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

  markExtraction(id: string, patch: Partial<CvVersion["extraction"]>): Promise<void> {
    this.events.push("mark");
    this.patches.push(patch);
    const row = this.rows.find((item) => item.id === id);
    if (row) row.extraction = { ...row.extraction, ...patch };
    return Promise.resolve();
  }

  saveData(id: string, data: CvData): Promise<CvVersion | null> {
    this.events.push("save");
    const row = this.rows.find((item) => item.id === id);
    if (!row || row.status !== "draft") return Promise.resolve(null);
    row.data = data;
    return Promise.resolve(row);
  }

  publish(): Promise<CvVersion> {
    return Promise.reject(new Error("publish was not expected"));
  }

  deleteDraft(): Promise<boolean> {
    return Promise.reject(new Error("deleteDraft was not expected"));
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
  headError: Error | null = null;
  readError: Error | null = null;

  head(pathname: string): Promise<BlobHead | null> {
    if (this.headError) return Promise.reject(this.headError);
    return Promise.resolve(this.files.get(pathname) ?? null);
  }

  read(): Promise<null> {
    return Promise.reject(new Error("read was not expected"));
  }

  readBytes(pathname: string): Promise<Uint8Array | null> {
    if (this.readError) return Promise.reject(this.readError);
    if (!this.bytes.has(pathname)) return Promise.reject(new Error("readBytes was not expected"));
    return Promise.resolve(this.bytes.get(pathname) ?? null);
  }

  delete(): Promise<void> {
    return Promise.reject(new Error("delete was not expected"));
  }
}

const now = new Date("2026-09-25T12:00:00.000Z");
const session = {} as TransactionContext["session"];

function setup(head?: BlobHead) {
  const versions = new MemoryCvVersions();
  const blobs = new MemoryBlobs();
  if (head) blobs.files.set("cv/resume.pdf", head);
  const transaction = <T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> => {
    versions.events.push("transaction");
    return work({ session });
  };
  const extract = new MemoryExtractor();
  const service = new CvService(versions, blobs, extract, transaction, () => now);
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
  expect(versions.events).toEqual(["find-id", "mark", "save", "mark"]);
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
  expect(versions.events.includes("save")).toBe(false);
});

test("runExtraction rejects a fresh running draft before reading the PDF", async () => {
  const { service, versions, blobs, extract } = setup();
  versions.rows.push(draft({ status: "running", startedAt: now.toISOString() }));
  blobs.bytes.set("cv/resume.pdf", pdfBytes);
  extract.result = { data: sampleCv, model: "extract-model" };

  const error = await rejection(() => service.runExtraction("cv-1"));

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

  const error = await rejection(() => service.runExtraction("cv-1"));

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
  expect((await rejection(() => succeeded.service.runExtraction("cv-1"))).message).toBe(
    "Extraction has already succeeded.",
  );

  const published = setup();
  published.versions.rows.push(draft({ status: "pending" }, "published"));
  expect((await rejection(() => published.service.runExtraction("cv-1"))).message).toBe(
    "Extraction is only available for a draft.",
  );

  const missing = setup();
  expect((await rejection(() => missing.service.runExtraction("missing"))).message).toBe(
    'CV version "missing" was not found.',
  );

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
  expect(versions.events.includes("save")).toBe(false);
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
