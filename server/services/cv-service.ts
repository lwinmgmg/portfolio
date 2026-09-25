import type { TransactionContext } from "@/server/db/transaction";
import {
  CV_PDF_CONTENT_TYPE,
  CV_PDF_MAX_BYTES,
  type BlobStore,
} from "@/server/domain/blob-store";
import type {
  CvExtractor,
  CvPdf,
  CvVersion,
  CvVersionRepository,
} from "@/server/domain/cv";

export class InvalidCvError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidCvError";
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
  ) {}

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
    const registered = await this.versions.findByPdfPathname(input.pathname);
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
        const registeredAfterError = await this.versions.findByPdfPathname(input.pathname);
        if (registeredAfterError) return registeredAfterError;
      } catch {
        // Preserve the original write error if the recovery read also fails.
      }
      throw error;
    }
  }

  async runExtraction(versionId: string): Promise<void> {
    const version = await this.requireExtractableDraft(versionId);
    try {
      await this.extractDraft(version);
    } catch (error) {
      const message = extractionErrorMessage(error);
      try {
        await this.versions.markExtraction(version.id, {
          status: "failed",
          error: message,
          finishedAt: this.now().toISOString(),
        });
      } catch (markError) {
        console.error(markError);
      }
      if (error instanceof InvalidCvError) throw error;
      throw new InvalidCvError(message, { cause: error });
    }
  }

  private async requireExtractableDraft(versionId: string): Promise<CvVersion> {
    const version = await this.versions.findById(versionId);
    if (!version) throw new InvalidCvError(`CV version "${versionId}" was not found.`);
    if (version.status !== "draft") {
      throw new InvalidCvError("Extraction is only available for a draft.");
    }
    if (version.extraction.status === "succeeded") {
      throw new InvalidCvError("Extraction has already succeeded.");
    }
    if (version.extraction.status === "running" && !isStaleRunning(version, this.now())) {
      throw new InvalidCvError("Extraction is already running.");
    }
    return version;
  }

  private async extractDraft(version: CvVersion): Promise<void> {
    await this.versions.markExtraction(version.id, {
      status: "running",
      error: null,
      startedAt: this.now().toISOString(),
      finishedAt: null,
    });

    const pdf = await this.blobs.readBytes(version.pdf.pathname);
    if (!pdf) throw new InvalidCvError("The uploaded PDF was not found.");

    const extracted = await this.extractor.extract(pdf, version.pdf.filename);
    const model = extracted.model.trim();
    if (model.length === 0) throw new InvalidCvError("Extraction did not report a model.");

    const saved = await this.versions.saveData(version.id, extracted.data);
    if (!saved) throw new InvalidCvError("The CV draft could not be saved.");

    await this.versions.markExtraction(version.id, {
      status: "succeeded",
      model,
      error: null,
      finishedAt: this.now().toISOString(),
    });
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
    "pdf.pathname" in candidate.keyPattern
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

function extractionErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.length > 0 ? error.message : "Extraction failed.";
  return Array.from(message).slice(0, EXTRACTION_ERROR_LIMIT).join("");
}
