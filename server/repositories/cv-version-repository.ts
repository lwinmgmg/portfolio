import "server-only";

import type { Filter, WithId } from "mongodb";

import type { TransactionContext } from "@/server/db/transaction";
import {
  CvVersionNotFoundError,
  type CvData,
  type CvPdf,
  type CvVersion,
  type CvVersionRepository,
} from "@/server/domain/cv";
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
  data: CvData | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  // Idempotency key for the original upload. Copies share pdf.pathname and use another key.
  uploadPathname?: string;
};

function parseInstant(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date "${value}".`);
  }
  return date;
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
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
      data: document.data,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      publishedAt: toIso(document.publishedAt),
    };
  }

  protected override async createIndexes(): Promise<unknown> {
    await this.dropUniquePdfPathnameIndex();
    await this.backfillUploadPathnames();
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
        pdf: {
          pathname: input.pdf.pathname,
          filename: input.pdf.filename,
          size: input.pdf.size,
          contentType: "application/pdf",
          uploadedAt: parseInstant(input.pdf.uploadedAt),
        },
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
    const objectId = this.parseId(id);
    if (!objectId) return null;
    return this.findByObjectId(objectId);
  }

  async findByPdfPathname(pathname: string): Promise<CvVersion | null> {
    const document = await this.collection().findOne({ uploadPathname: pathname });
    return document ? this.toEntity(document) : null;
  }

  async countByPdfPathname(pathname: string): Promise<number> {
    await this.ensureReady();
    return this.collection().countDocuments({ "pdf.pathname": pathname });
  }

  async findPublished(): Promise<CvVersion | null> {
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

  async markExtraction(id: string, patch: Partial<CvVersion["extraction"]>): Promise<void> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return;

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

    await this.collection().updateOne({ _id: objectId }, { $set: fields });
  }

  async saveData(id: string, data: CvData): Promise<CvVersion | null> {
    await this.ensureReady();
    const objectId = this.parseId(id);
    if (!objectId) return null;
    const document = await this.collection().findOneAndUpdate(
      { _id: objectId, status: "draft" },
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
      throw new Error(`CV version "${id}" must be a complete draft to publish.`);
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
      throw new Error(`CV version "${id}" is no longer a complete draft to publish.`);
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

  async createCopy(input: {
    pdf: CvPdf;
    data: CvData;
    model: string | null;
    finishedAt: string;
  }): Promise<CvVersion> {
    await this.ensureReady();
    const finishedAt = parseInstant(input.finishedAt);
    const document: CvVersionDocument = {
      status: "draft",
      pdf: {
        pathname: input.pdf.pathname,
        filename: input.pdf.filename,
        size: input.pdf.size,
        contentType: "application/pdf",
        uploadedAt: parseInstant(input.pdf.uploadedAt),
      },
      extraction: {
        status: "succeeded",
        model: input.model,
        error: null,
        startedAt: finishedAt,
        finishedAt,
      },
      data: input.data,
      createdAt: finishedAt,
      updatedAt: finishedAt,
      publishedAt: null,
      uploadPathname: `copy:${crypto.randomUUID()}`,
    };
    const result = await this.collection().insertOne(document);
    return this.toEntity({ ...document, _id: result.insertedId });
  }

  private async dropUniquePdfPathnameIndex(): Promise<void> {
    const indexes = await this.collection().indexes();
    for (const index of indexes) {
      const keys = Object.keys(index.key);
      if (index.unique === true && index.name && keys.length === 1 && keys[0] === "pdf.pathname") {
        await this.collection().dropIndex(index.name);
      }
    }
  }

  private backfillUploadPathnames(): Promise<unknown> {
    return this.collection().updateMany({ uploadPathname: { $exists: false } }, [
      { $set: { uploadPathname: "$pdf.pathname" } },
    ]);
  }
}
