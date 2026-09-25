import type { TransactionContext } from "@/server/db/transaction";
import {
  CV_PDF_CONTENT_TYPE,
  CV_PDF_MAX_BYTES,
  type BlobStore,
} from "@/server/domain/blob-store";
import type { CvPdf, CvVersion, CvVersionRepository } from "@/server/domain/cv";

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

    // Index builds are not allowed inside a transaction.
    await this.versions.ensureReady();
    return this.transaction((tx) => this.versions.create({ pdf }, tx));
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
