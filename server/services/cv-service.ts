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
  CvVersionNotFoundError,
  type CvData,
  type CvExtractor,
  type CvFieldIssue,
  type CvPdf,
  type CvPublishedListener,
  type CvVersion,
  type CvVersionRepository,
} from "@/server/domain/cv";

export class InvalidCvError extends Error {
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

  async saveDraft(id: string, input: unknown): Promise<CvVersion> {
    const version = await this.requireDraft(id, "Only a draft can be edited.");
    if (isExtractionInProgress(version, this.now())) {
      throw new InvalidCvError("Wait for extraction to finish before editing.");
    }
    const data = this.parseCvData(input);
    const saved = await this.versions.saveData(version.id, data);
    if (!saved) throw new InvalidCvError("The CV draft could not be saved.");
    return saved;
  }

  async publish(id: string): Promise<CvVersion> {
    const version = await this.requireDraft(id, "Only a draft with extracted CV data can be published.");
    if (version.extraction.status !== "succeeded" || version.data === null) {
      throw new InvalidCvError("Only a draft with extracted CV data can be published.");
    }
    await this.versions.ensureReady();
    let published: CvVersion;
    try {
      published = await this.transaction((tx) => this.versions.publish(version.id, tx));
    } catch (error) {
      if (error instanceof CvVersionNotFoundError) {
        throw new InvalidCvError(error.message, { cause: error });
      }
      if (error instanceof Error && error.message.includes("complete draft")) {
        throw new InvalidCvError("Only a draft with extracted CV data can be published.", {
          cause: error,
        });
      }
      throw error;
    }
    await this.notifyPublished(published);
    return published;
  }

  async duplicateAsDraft(id: string): Promise<CvVersion> {
    const source = await this.versions.findById(id);
    if (!source) throw new InvalidCvError(`CV version "${id}" was not found.`);
    if (source.data === null) {
      throw new InvalidCvError("A version needs CV data before it can be duplicated.");
    }
    return this.versions.createCopy({
      pdf: source.pdf,
      data: this.parseCvData(source.data),
      model: source.extraction.model,
      finishedAt: this.now().toISOString(),
    });
  }

  async deleteDraft(id: string): Promise<void> {
    const version = await this.requireDraft(id, "Only a draft can be deleted.");
    const deleted = await this.versions.deleteDraft(version.id);
    if (!deleted) throw new InvalidCvError("The CV draft could not be deleted.");
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

  private async requireDraft(id: string, statusMessage: string): Promise<CvVersion> {
    const version = await this.versions.findById(id);
    if (!version) throw new InvalidCvError(`CV version "${id}" was not found.`);
    if (version.status !== "draft") throw new InvalidCvError(statusMessage);
    return version;
  }

  private parseCvData(input: unknown): CvData {
    const parsed = CvDataSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidCvError("The CV data is invalid.", {
        issues: cvFieldIssues(parsed.error.issues),
      });
    }
    try {
      return ensureIds(compactCvData(parsed.data));
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

function compactLines(items: readonly string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

function compactCvData(data: CvData): CvData {
  return {
    profile: {
      fullName: data.profile.fullName,
      headline: data.profile.headline,
      location: data.profile.location,
      summary: data.profile.summary,
      email: data.profile.email,
      phone: data.profile.phone,
      links: data.profile.links.map((link) => ({ label: link.label, url: link.url })),
    },
    experience: data.experience.map((item) => ({
      ...item,
      highlights: compactLines(item.highlights),
      technologies: compactLines(item.technologies),
    })),
    projects: data.projects.map((item) => ({
      ...item,
      highlights: compactLines(item.highlights),
      technologies: compactLines(item.technologies),
    })),
    education: data.education.map((item) => ({
      ...item,
      details: compactLines(item.details),
    })),
    skills: data.skills.map((item) => ({
      ...item,
      items: compactLines(item.items),
    })),
    certifications: data.certifications.map((item) => ({ ...item })),
    languages: data.languages.map((item) => ({ ...item })),
    otherSections: data.otherSections.map((item) => ({
      ...item,
      items: compactLines(item.items),
    })),
  };
}

function extractionErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.length > 0 ? error.message : "Extraction failed.";
  return Array.from(message).slice(0, EXTRACTION_ERROR_LIMIT).join("");
}
