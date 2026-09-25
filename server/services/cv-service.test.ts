import { expect, test } from "bun:test";

import type { TransactionContext } from "@/server/db/transaction";
import {
  CV_PDF_CONTENT_TYPE,
  CV_PDF_MAX_BYTES,
  type BlobHead,
  type BlobStore,
} from "@/server/domain/blob-store";
import type { CvPdf, CvVersion, CvVersionRepository } from "@/server/domain/cv";
import {
  CvService,
  cvUploadConstraints,
  InvalidCvError,
  type CvUploadInput,
} from "@/server/services/cv-service";

class MemoryCvVersions implements CvVersionRepository {
  rows: CvVersion[] = [];
  events: string[] = [];
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

  findById(): Promise<CvVersion | null> {
    return Promise.reject(new Error("findById was not expected"));
  }

  findPublished(): Promise<CvVersion | null> {
    return Promise.reject(new Error("findPublished was not expected"));
  }

  list(limit: number): Promise<CvVersion[]> {
    this.limit = limit;
    return Promise.resolve(this.rows.slice(0, limit));
  }

  markExtraction(): Promise<void> {
    return Promise.reject(new Error("markExtraction was not expected"));
  }

  saveData(): Promise<CvVersion | null> {
    return Promise.reject(new Error("saveData was not expected"));
  }

  publish(): Promise<CvVersion> {
    return Promise.reject(new Error("publish was not expected"));
  }

  deleteDraft(): Promise<boolean> {
    return Promise.reject(new Error("deleteDraft was not expected"));
  }
}

class MemoryBlobs implements BlobStore {
  files = new Map<string, BlobHead>();
  headError: Error | null = null;

  head(pathname: string): Promise<BlobHead | null> {
    if (this.headError) return Promise.reject(this.headError);
    return Promise.resolve(this.files.get(pathname) ?? null);
  }

  read(): Promise<null> {
    return Promise.reject(new Error("read was not expected"));
  }

  readBytes(): Promise<null> {
    return Promise.reject(new Error("readBytes was not expected"));
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
  const service = new CvService(versions, blobs, transaction, () => now);
  return { service, versions, blobs };
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
  expect(versions.events).toEqual(["ready", "transaction", "create"]);
  expect(versions.rows).toEqual([version]);
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
    expect(versions.events).toEqual([]);
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
  expect(versions.events).toEqual([]);
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
