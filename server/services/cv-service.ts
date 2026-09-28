import type { TransactionContext } from "@/server/db/transaction";
import { DuplicateCvEntityKeyError, ensureIds } from "@/server/cv/cv-ids";
import { cvFieldIssues } from "@/server/cv/cv-issues";
import { CvDataSchema } from "@/server/cv/cv-schema";
import {
  CV_PDF_CONTENT_TYPE,
  CV_PDF_MAX_BYTES,
  type BlobStore,
} from "@/server/domain/blob-store";
import {
  CvError,
  CvVersionNotFoundError,
  CvVersionStateError,
  type CvData,
  type CvExtractor,
  type CvFieldIssue,
  type CvPdf,
  type CvPublishedListener,
  type CvVersion,
  type CvVersionRepository,
} from "@/server/domain/cv";

// Input that does not satisfy the CV rules. `issues` point at the offending fields.
export class InvalidCvError extends CvError {
  readonly issues: readonly CvFieldIssue[];

  constructor(
    message: string,
    options?: { cause?: unknown; issues?: readonly CvFieldIssue[] },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "InvalidCvError";
    this.issues = options?.issues ?? [];
  }
}

type TransactionRunner = <T>(
  work: (tx: TransactionContext) => Promise<T>,
) => Promise<T>;

export type CvUploadInput = {
  pathname: string;
  filename: string;
};

export type CvUploadConstraints = {
  allowedContentTypes: [typeof CV_PDF_CONTENT_TYPE];
  maximumSizeInBytes: number;
  addRandomSuffix: true;
};

const PDF_EXTENSION = ".pdf";
const STALE_EXTRACTION_MS = 5 * 60 * 1000;
const EXTRACTION_ERROR_LIMIT = 500;

export function isExtractionInProgress(version: CvVersion, now = new Date()): boolean {
  if (version.extraction.status === "pending") return true;
  return version.extraction.status === "running" && !isStaleRunning(version, now);
}

export function canRetryExtraction(version: CvVersion, now = new Date()): boolean {
  if (version.status !== "draft") return false;
  if (version.extraction.status === "failed") return true;
  return version.extraction.status === "running" && isStaleRunning(version, now);
}

// A stale run may still finish, so only a settled extraction can be edited.
export function canEditCv(version: CvVersion): boolean {
  return version.status === "draft" && version.data !== null && isExtractionSettled(version);
}

export function canPublishCv(version: CvVersion): boolean {
  return (
    version.status === "draft" &&
    version.extraction.status === "succeeded" &&
    version.data !== null
  );
}

export function cvUploadConstraints(pathname: string): CvUploadConstraints {
  if (!isStoredCvPdfPath(pathname)) {
    throw new InvalidCvError("The PDF must be stored at a cv/ path.");
  }

  return {
    allowedContentTypes: [CV_PDF_CONTENT_TYPE],
    maximumSizeInBytes: CV_PDF_MAX_BYTES,
    addRandomSuffix: true,
  };
}

export class CvService {
  constructor(
    private readonly versions: CvVersionRepository,
    private readonly blobs: BlobStore,
    private readonly extractor: CvExtractor,
    private readonly transaction: TransactionRunner,
    private readonly now: () => Date = () => new Date(),
    private readonly publishListeners: readonly CvPublishedListener[] = [],
  ) {}

  get(id: string): Promise<CvVersion | null> {
    return this.versions.findById(id);
  }

  // The CV shown to visitors. Publishing requires data, so null means nothing is published.
  async getPublishedData(): Promise<CvData | null> {
    const published = await this.versions.findPublished();
    return published?.data ?? null;
  }

  list(limit: number): Promise<CvVersion[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new InvalidCvError("The version list limit must be a positive integer.");
    }
    return this.versions.list(limit);
  }

  async registerUpload(input: CvUploadInput): Promise<CvVersion> {
    const filename = input.filename.trim();
    if (!isStoredCvPdfPath(input.pathname)) {
      throw new InvalidCvError("The PDF must be stored at a cv/ path.");
    }
    if (!isPdfFileName(filename)) {
      throw new InvalidCvError("The file name must end with .pdf.");
    }

    // A retry may follow a committed write whose response never reached the client.
    // Build the unique pathname index before the first lookup or transaction.
    await this.versions.ensureReady();
    const registered = await this.versions.findByUploadPathname(input.pathname);
    if (registered) return registered;

    const head = await this.readPdfHead(input.pathname);
    if (!Number.isFinite(head.size) || head.size < 0 || head.size > CV_PDF_MAX_BYTES) {
      throw new InvalidCvError("The PDF must be 10 MB or smaller.");
    }
    if (!isPdfContentType(head.contentType)) {
      throw new InvalidCvError("The uploaded file must be a PDF.");
    }

    const pdf: CvPdf = {
      pathname: input.pathname,
      filename,
      size: head.size,
      contentType: CV_PDF_CONTENT_TYPE,
      uploadedAt: this.now().toISOString(),
    };

    try {
      return await this.transaction((tx) => this.versions.create({ pdf }, tx));
    } catch (error) {
      if (!mayHaveCommittedCvPath(error)) throw error;

      // A concurrent request may have won the unique index, or the commit may
      // have succeeded before the driver reported an uncertain result.
      try {
        const registeredAfterError = await this.versions.findByUploadPathname(input.pathname);
        if (registeredAfterError) return registeredAfterError;
      } catch {
        // Preserve the original write error if the recovery read also fails.
      }
      throw error;
    }
  }

  async runExtraction(versionId: string): Promise<void> {
    const version = await this.requireExtractableDraft(versionId);
    // The start time identifies this run. A newer run or a deleted draft makes its writes no-ops.
    const run = { startedAt: this.now().toISOString() };
    try {
      await this.extractDraft(version, run.startedAt);
    } catch (error) {
      const message = extractionErrorMessage(error);
      try {
        await this.versions.markExtraction(
          version.id,
          { status: "failed", error: message, finishedAt: this.now().toISOString() },
          run,
        );
      } catch (markError) {
        console.error(markError);
      }
      if (error instanceof CvError) throw error;
      throw new InvalidCvError(message, { cause: error });
    }
  }

  private async requireExtractableDraft(versionId: string): Promise<CvVersion> {
    const version = await this.requireVersion(versionId);
    if (version.status !== "draft") {
      throw new CvVersionStateError("Extraction is only available for a draft.");
    }
    if (version.extraction.status === "succeeded") {
      throw new CvVersionStateError("Extraction has already succeeded.");
    }
    if (version.extraction.status === "running" && !isStaleRunning(version, this.now())) {
      throw new CvVersionStateError("Extraction is already running.");
    }
    return version;
  }

  private async extractDraft(version: CvVersion, startedAt: string): Promise<void> {
    await this.versions.markExtraction(version.id, {
      status: "running",
      error: null,
      startedAt,
      finishedAt: null,
    });

    const pdf = await this.blobs.readBytes(version.pdf.pathname);
    if (!pdf) throw new InvalidCvError("The uploaded PDF was not found.");

    const extracted = await this.extractor.extract(pdf, version.pdf.filename);
    const model = extracted.model.trim();
    if (model.length === 0) throw new InvalidCvError("Extraction did not report a model.");

    const saved = await this.versions.completeExtraction(version.id, startedAt, {
      data: extracted.data,
      model,
      finishedAt: this.now().toISOString(),
    });
    if (!saved) {
      throw new CvVersionStateError("The CV draft changed while extraction was running.");
    }
  }

  // `expectedUpdatedAt` is the version the editor loaded. A newer save or extraction wins.
  async saveDraft(id: string, input: unknown, expectedUpdatedAt: string): Promise<CvVersion> {
    const version = await this.requireVersion(id);
    if (version.status !== "draft") {
      throw new CvVersionStateError("Only a draft can be edited.");
    }
    if (!isExtractionSettled(version)) {
      throw new CvVersionStateError("Wait for extraction to finish before editing.");
    }
    const data = parseCvData(input);
    const saved = await this.versions.saveData(version.id, data, expectedUpdatedAt);
    if (!saved) {
      throw new CvVersionStateError(
        "This draft changed after you opened it. Reload the page to see the latest version.",
      );
    }
    return saved;
  }

  async publish(id: string): Promise<CvVersion> {
    const version = await this.requireVersion(id);
    if (!canPublishCv(version)) {
      throw new CvVersionStateError("Only a draft with extracted CV data can be published.");
    }
    await this.versions.ensureReady();
    const published = await this.transaction((tx) => this.versions.publish(version.id, tx));
    await this.notifyPublished(published);
    return published;
  }

  async duplicateAsDraft(id: string): Promise<CvVersion> {
    const source = await this.requireVersion(id);
    if (source.data === null) {
      throw new CvVersionStateError("A version needs CV data before it can be duplicated.");
    }
    // Known race: duplicating a draft while it is deleted can leave the copy pointing at a
    // PDF that deleteDraft just removed. The admin UI only duplicates published or archived
    // versions, which cannot be deleted.
    return this.versions.createCopy(source, parseCvData(source.data));
  }

  async deleteDraft(id: string): Promise<void> {
    const version = await this.requireVersion(id);
    if (version.status !== "draft") {
      throw new CvVersionStateError("Only a draft can be deleted.");
    }
    const deleted = await this.versions.deleteDraft(version.id);
    if (!deleted) throw new CvVersionStateError("The CV draft could not be deleted.");
    const remaining = await this.versions.countByPdfPathname(version.pdf.pathname);
    if (remaining > 0) return;
    try {
      await this.blobs.delete(version.pdf.pathname);
    } catch (error) {
      console.error(error);
    }
  }

  async openPdf(id: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    size: number;
    filename: string;
  } | null> {
    const version = await this.versions.findById(id);
    if (!version) return null;
    const body = await this.blobs.read(version.pdf.pathname);
    if (!body) return null;
    return { stream: body.stream, size: body.size, filename: version.pdf.filename };
  }

  private async requireVersion(id: string): Promise<CvVersion> {
    const version = await this.versions.findById(id);
    if (!version) throw new CvVersionNotFoundError(id);
    return version;
  }

  private async notifyPublished(version: CvVersion): Promise<void> {
    for (const listener of this.publishListeners) {
      try {
        await listener.onCvPublished(version);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private async readPdfHead(pathname: string) {
    try {
      const head = await this.blobs.head(pathname);
      if (!head) throw new InvalidCvError("The uploaded PDF was not found.");
      return head;
    } catch (error) {
      if (error instanceof InvalidCvError) throw error;
      throw new InvalidCvError("The uploaded PDF could not be verified.", { cause: error });
    }
  }
}

function mayHaveCommittedCvPath(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    code?: unknown;
    keyPattern?: unknown;
    hasErrorLabel?: unknown;
  };
  if (
    candidate.code === 11000 &&
    typeof candidate.keyPattern === "object" &&
    candidate.keyPattern !== null &&
    ("pdf.pathname" in candidate.keyPattern || "uploadPathname" in candidate.keyPattern)
  ) {
    return true;
  }
  return (
    typeof candidate.hasErrorLabel === "function" &&
    candidate.hasErrorLabel("UnknownTransactionCommitResult") === true
  );
}

function isStoredCvPdfPath(pathname: string): boolean {
  if (!pathname.startsWith("cv/")) return false;
  return isPdfFileName(pathname.slice("cv/".length));
}

function isPdfFileName(filename: string): boolean {
  if (
    filename.length <= PDF_EXTENSION.length ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  ) {
    return false;
  }
  return filename.toLowerCase().endsWith(PDF_EXTENSION);
}

function isPdfContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === CV_PDF_CONTENT_TYPE;
}

function isStaleRunning(version: CvVersion, now: Date): boolean {
  if (version.extraction.status !== "running") return false;
  const startedAt = version.extraction.startedAt;
  if (startedAt === null) return true;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return now.getTime() - started >= STALE_EXTRACTION_MS;
}

function isExtractionSettled(version: CvVersion): boolean {
  return version.extraction.status === "succeeded" || version.extraction.status === "failed";
}

function parseCvData(input: unknown): CvData {
  const parsed = CvDataSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidCvError("The CV data is invalid.", {
      issues: cvFieldIssues(parsed.error.issues),
    });
  }
  try {
    return ensureIds(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateCvEntityKeyError) {
      throw new InvalidCvError(error.message, {
        cause: error,
        issues: [{ path: error.entityKey, message: error.message }],
      });
    }
    throw error;
  }
}

function extractionErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.length > 0 ? error.message : "Extraction failed.";
  return Array.from(message).slice(0, EXTRACTION_ERROR_LIMIT).join("");
}
