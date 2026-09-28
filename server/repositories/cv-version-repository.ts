import "server-only";

import type { Filter, ObjectId, WithId } from "mongodb";

import { type StoredCvData, upgradeStoredCvData } from "@/server/cv/cv-legacy";
import type { TransactionContext } from "@/server/db/transaction";
import { CV_PDF_CONTENT_TYPE } from "@/server/domain/blob-store";
import {
  CvVersionNotFoundError,
  CvVersionStateError,
  type CvData,
  type CvExtractionResult,
  type CvPdf,
  type CvVersion,
  type CvVersionRepository,
} from "@/server/domain/cv";
import { migrateLegacyUploadKeys } from "@/server/repositories/cv-version-migration";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type CvVersionDocument = {
  status: CvVersion["status"];
  pdf: {
    pathname: string;
    filename: string;
    size: number;
    contentType: "application/pdf";
    uploadedAt: Date;
  };
  extraction: {
    status: CvVersion["extraction"]["status"];
    model: string | null;
    error: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  };
  data: StoredCvData | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  // Idempotency key of an original upload. A copy shares pdf.pathname and has no key.
  uploadPathname?: string;
  // Set on a copy made by "Duplicate as draft".
  sourceVersionId?: ObjectId;
};

// Only a settled extraction may be overwritten by an admin edit.
const EDITABLE_EXTRACTION_STATUSES: CvVersion["extraction"]["status"][] = ["succeeded", "failed"];

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toDate(value: string | null): Date | null {
  return value === null ? null : parseInstant(value);
}

// `create` and `publish` run inside a caller-supplied transaction, so they do not build indexes.
// Call `ensureReady()` before opening that transaction.
export class MongoCvVersionRepository
  extends MongoRepository<CvVersion, CvVersionDocument>
  implements CvVersionRepository
{
  constructor() {
    super("cv_versions");
  }

  protected toEntity(document: WithId<CvVersionDocument>): CvVersion {
    return {
      id: document._id.toHexString(),
      status: document.status,
      pdf: {
        pathname: document.pdf.pathname,
        filename: document.pdf.filename,
        size: document.pdf.size,
        contentType: document.pdf.contentType,
        uploadedAt: document.pdf.uploadedAt.toISOString(),
      },
      extraction: {
        status: document.extraction.status,
        model: document.extraction.model,
        error: document.extraction.error,
        startedAt: toIso(document.extraction.startedAt),
        finishedAt: toIso(document.extraction.finishedAt),
      },
      data: document.data ? upgradeStoredCvData(document.data) : null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      publishedAt: toIso(document.publishedAt),
    };
  }

  protected override async createIndexes(): Promise<unknown> {
    await migrateLegacyUploadKeys(this.collection());
    return Promise.all([
      this.collection().createIndex({ createdAt: -1 }),
      this.collection().createIndex({ "pdf.pathname": 1 }),
      this.collection().createIndex(
        { uploadPathname: 1 },
        {
          unique: true,
          partialFilterExpression: { uploadPathname: { $type: "string" } },
        },
      ),
      this.collection().createIndex(
        { status: 1 },
        {
          unique: true,
          partialFilterExpression: { status: "published" },
        },
      ),
    ]);
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  create(input: { pdf: CvPdf }, tx: TransactionContext): Promise<CvVersion> {
    const now = new Date();
    return this.insert(
      {
        status: "draft",
        pdf: toPdfDocument(input.pdf),
        extraction: {
          status: "pending",
          model: null,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
        data: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        uploadPathname: input.pdf.pathname,
      },
      tx,
    );
  }

  async findById(id: string): Promise<CvVersion | null> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.findByObjectId(objectId);
  }

  async findByUploadPathname(pathname: string): Promise<CvVersion | null> {
    await this.ensureReady();
    const document = await this.collection().findOne({ uploadPathname: pathname });
    return document ? this.toEntity(document) : null;
  }

  async countByPdfPathname(pathname: string): Promise<number> {
    await this.ensureReady();
    return this.collection().countDocuments({ "pdf.pathname": pathname });
  }

  async findPublished(): Promise<CvVersion | null> {
    await this.ensureReady();
    const document = await this.collection().findOne({ status: "published" });
    return document ? this.toEntity(document) : null;
  }

  async list(limit: number): Promise<CvVersion[]> {
    await this.ensureReady();
    const documents = await this.collection()
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => this.toEntity(document));
  }

  async markExtraction(
    id: string,
    patch: Partial<CvVersion["extraction"]>,
    run?: { startedAt: string },
  ): Promise<void> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return;
    const filter: Filter<CvVersionDocument> = run
      ? { _id: objectId, ...currentRun(run.startedAt) }
      : { _id: objectId };

    const fields: Record<string, Date | string | null> = {
      updatedAt: new Date(),
    };
    if (patch.status !== undefined) fields["extraction.status"] = patch.status;
    if (patch.model !== undefined) fields["extraction.model"] = patch.model;
    if (patch.error !== undefined) fields["extraction.error"] = patch.error;
    if (patch.startedAt !== undefined) {
      fields["extraction.startedAt"] =
        patch.startedAt === null ? null : parseInstant(patch.startedAt);
    }
    if (patch.finishedAt !== undefined) {
      fields["extraction.finishedAt"] =
        patch.finishedAt === null ? null : parseInstant(patch.finishedAt);
    }

    await this.collection().updateOne(filter, { $set: fields });
  }

  async completeExtraction(
    id: string,
    startedAt: string,
    result: CvExtractionResult,
  ): Promise<CvVersion | null> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return null;
    const document = await this.collection().findOneAndUpdate(
      { _id: objectId, status: "draft", ...currentRun(startedAt) },
      {
        $set: {
          data: result.data,
          "extraction.status": "succeeded",
          "extraction.model": result.model,
          "extraction.error": null,
          "extraction.finishedAt": parseInstant(result.finishedAt),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    return document ? this.toEntity(document) : null;
  }

  async saveData(
    id: string,
    data: CvData,
    expectedUpdatedAt: string,
  ): Promise<CvVersion | null> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return null;
    const document = await this.collection().findOneAndUpdate(
      {
        _id: objectId,
        status: "draft",
        "extraction.status": { $in: EDITABLE_EXTRACTION_STATUSES },
        updatedAt: parseInstant(expectedUpdatedAt),
      },
      { $set: { data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return document ? this.toEntity(document) : null;
  }

  async publish(id: string, tx: TransactionContext): Promise<CvVersion> {
    const objectId = this.parseId(id);
    if (!objectId) throw new CvVersionNotFoundError(id);

    const existing = await this.collection().findOne({ _id: objectId }, { session: tx.session });
    if (!existing) throw new CvVersionNotFoundError(id);
    if (
      existing.status !== "draft" ||
      existing.extraction.status !== "succeeded" ||
      existing.data == null
    ) {
      throw new CvVersionStateError(NOT_PUBLISHABLE);
    }

    const eligibleDraft: Filter<CvVersionDocument> = {
      _id: objectId,
      status: "draft",
      "extraction.status": "succeeded",
      data: { $ne: null, $exists: true },
    };

    const now = new Date();
    // Archive first. The partial unique index allows only one published version.
    await this.collection().updateMany(
      { status: "published" },
      { $set: { status: "archived", updatedAt: now } },
      { session: tx.session },
    );
    const document = await this.collection().findOneAndUpdate(
      eligibleDraft,
      { $set: { status: "published", publishedAt: now, updatedAt: now } },
      { returnDocument: "after", session: tx.session },
    );
    if (!document) {
      throw new CvVersionStateError("The draft changed while it was being published. Reload and try again.");
    }
    return this.toEntity(document);
  }

  async deleteDraft(id: string): Promise<boolean> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return false;
    const result = await this.collection().deleteOne({ _id: objectId, status: "draft" });
    return result.deletedCount === 1;
  }

  async createCopy(source: CvVersion, data: CvData): Promise<CvVersion> {
    await this.ensureReady();
    const sourceId = this.parseId(source.id);
    if (!sourceId) throw new CvVersionNotFoundError(source.id);
    const now = new Date();
    // The copy keeps the extraction that produced its data. It has no upload key.
    const document: CvVersionDocument = {
      status: "draft",
      pdf: toPdfDocument(source.pdf),
      extraction: {
        status: "succeeded",
        model: source.extraction.model,
        error: null,
        startedAt: toDate(source.extraction.startedAt),
        finishedAt: toDate(source.extraction.finishedAt),
      },
      data,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      sourceVersionId: sourceId,
    };
    const result = await this.collection().insertOne(document);
    return this.toEntity({ ...document, _id: result.insertedId });
  }
}

const NOT_PUBLISHABLE = "Only a draft with extracted CV data can be published.";

function currentRun(startedAt: string): Filter<CvVersionDocument> {
  return { "extraction.status": "running", "extraction.startedAt": parseInstant(startedAt) };
}

function toPdfDocument(pdf: CvPdf): CvVersionDocument["pdf"] {
  return {
    pathname: pdf.pathname,
    filename: pdf.filename,
    size: pdf.size,
    contentType: CV_PDF_CONTENT_TYPE,
    uploadedAt: parseInstant(pdf.uploadedAt),
  };
}
