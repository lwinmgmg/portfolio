import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { TransactionContext } from "@/server/db/transaction";
import type { CvData, CvVersionStatus, ExtractionStatus } from "@/server/domain/cv";

let activeCollection: unknown;
const { mock } = (await import("bun:test")) as unknown as {
  mock: { module(id: string, factory: () => object): void };
};
class TestObjectId {
  constructor(private readonly value = "507f1f77bcf86cd799439011") {}

  static isValid(value: string): boolean {
    return /^[0-9a-f]{24}$/i.test(value);
  }

  toHexString(): string {
    return this.value;
  }
}

// Bun cannot load BSON's node:v8 snapshot probe; ObjectId conversion is not under test here.
mock.module("mongodb", () => ({ ObjectId: TestObjectId }));
mock.module("server-only", () => ({}));
mock.module("@/server/db/client", () => ({
  getDb: () => ({ collection: () => activeCollection }),
}));

const { MongoCvVersionRepository } = await import("@/server/repositories/cv-version-repository");

function makeDocument(
  id: TestObjectId,
  changes: {
    status?: CvVersionStatus;
    extractionStatus?: ExtractionStatus;
    data?: CvData | null;
  } = {},
) {
  const now = new Date("2026-09-24T00:00:00.000Z");
  return {
    _id: id,
    status: changes.status ?? "draft",
    pdf: {
      pathname: "cv/test.pdf",
      filename: "test.pdf",
      size: 100,
      contentType: "application/pdf" as const,
      uploadedAt: now,
    },
    extraction: {
      status: changes.extractionStatus ?? "succeeded",
      model: null,
      error: null,
      startedAt: now,
      finishedAt: now,
    },
    data: changes.data === undefined ? sampleCv : changes.data,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };
}

const session = {} as TransactionContext["session"];
const tx = { session } as TransactionContext;

function readyCollection(extra: Record<string, unknown> = {}) {
  return {
    indexes: async () => [] as unknown[],
    dropIndex: async () => undefined,
    updateMany: async () => undefined,
    createIndex: async () => undefined,
    ...extra,
  };
}

test("ensureReady lets duplicated drafts share a PDF path and keeps uploads unique", async () => {
  const indexes: unknown[][] = [];
  const dropped: string[] = [];
  const updates: unknown[][] = [];
  activeCollection = {
    indexes: async () => [{ name: "pdf.pathname_1", key: { "pdf.pathname": 1 }, unique: true }],
    dropIndex: async (name: string) => {
      dropped.push(name);
    },
    updateMany: async (...args: unknown[]) => {
      updates.push(args);
    },
    createIndex: async (...args: unknown[]) => {
      indexes.push(args);
    },
  };

  await new MongoCvVersionRepository().ensureReady();

  expect(dropped).toEqual(["pdf.pathname_1"]);
  expect(updates[0]?.[0]).toEqual({
    uploadPathname: { $exists: false },
    sourceVersionId: { $exists: false },
  });
  expect(indexes).toEqual([
    [{ createdAt: -1 }],
    [{ "pdf.pathname": 1 }],
    [
      { uploadPathname: 1 },
      { unique: true, partialFilterExpression: { uploadPathname: { $type: "string" } } },
    ],
    [{ status: 1 }, { unique: true, partialFilterExpression: { status: "published" } }],
  ]);
});

test("findByUploadPathname looks up the original upload key", async () => {
  const document = makeDocument(new TestObjectId());
  let filter: unknown;
  activeCollection = readyCollection({
    findOne: async (value: unknown) => {
      filter = value;
      return document;
    },
  });

  const found = await new MongoCvVersionRepository().findByUploadPathname("cv/test.pdf");

  expect(filter).toEqual({ uploadPathname: "cv/test.pdf" });
  expect(found?.pdf.pathname).toBe("cv/test.pdf");
});

test("create stores the upload pathname used to recognize a retried registration", async () => {
  const captured: { document?: Record<string, unknown> } = {};
  activeCollection = {
    insertOne: async (document: Record<string, unknown>) => {
      captured.document = document;
      return { insertedId: new TestObjectId() };
    },
  };

  await new MongoCvVersionRepository().create(
    {
      pdf: {
        pathname: "cv/test.pdf",
        filename: "test.pdf",
        size: 100,
        contentType: "application/pdf",
        uploadedAt: "2026-09-24T00:00:00.000Z",
      },
    },
    tx,
  );

  expect(captured.document?.uploadPathname).toBe("cv/test.pdf");
  expect((captured.document?.extraction as { status?: string } | undefined)?.status).toBe("pending");
});

test("createCopy inserts a succeeded draft that shares the PDF and has no upload key", async () => {
  const captured: { document?: Record<string, unknown> } = {};
  activeCollection = readyCollection({
    insertOne: async (document: Record<string, unknown>) => {
      captured.document = document;
      return { insertedId: new TestObjectId("507f1f77bcf86cd799439012") };
    },
  });
  const source = {
    id: "507f1f77bcf86cd799439011",
    status: "published" as const,
    pdf: {
      pathname: "cv/test.pdf",
      filename: "test.pdf",
      size: 100,
      contentType: "application/pdf" as const,
      uploadedAt: "2026-09-24T00:00:00.000Z",
    },
    extraction: {
      status: "succeeded" as const,
      model: "extract-model",
      error: null,
      startedAt: "2026-09-24T00:01:00.000Z",
      finishedAt: "2026-09-24T00:02:00.000Z",
    },
    data: sampleCv,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:02:00.000Z",
    publishedAt: "2026-09-24T00:03:00.000Z",
  };

  const version = await new MongoCvVersionRepository().createCopy(source, sampleCv);

  expect(version.id).toBe("507f1f77bcf86cd799439012");
  expect(version.status).toBe("draft");
  expect(version.data).toEqual(sampleCv);
  expect(version.extraction).toEqual(source.extraction);
  expect(version.pdf).toEqual(source.pdf);
  expect(version.publishedAt).toBeNull();
  expect("uploadPathname" in (captured.document ?? {})).toBe(false);
  expect((captured.document?.sourceVersionId as TestObjectId).toHexString()).toBe(source.id);
});

test("saveData writes only a settled draft at the version the editor loaded", async () => {
  const id = new TestObjectId();
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    findOneAndUpdate: async (...args: unknown[]) => {
      calls.push(args);
      return makeDocument(id);
    },
  });

  await new MongoCvVersionRepository().saveData(id.toHexString(), sampleCv, "2026-09-24T00:00:00.000Z");

  expect(calls[0]?.[0]).toEqual({
    _id: id,
    status: "draft",
    "extraction.status": { $in: ["succeeded", "failed"] },
    updatedAt: new Date("2026-09-24T00:00:00.000Z"),
  });
});

test("completeExtraction and a guarded markExtraction write only to the current run", async () => {
  const id = new TestObjectId();
  const filters: unknown[] = [];
  activeCollection = readyCollection({
    findOneAndUpdate: async (filter: unknown) => {
      filters.push(filter);
      return makeDocument(id);
    },
    updateOne: async (filter: unknown) => {
      filters.push(filter);
    },
  });
  const repository = new MongoCvVersionRepository();
  const startedAt = "2026-09-24T00:01:00.000Z";
  const run = { "extraction.status": "running", "extraction.startedAt": new Date(startedAt) };

  const saved = await repository.completeExtraction(id.toHexString(), startedAt, {
    data: sampleCv,
    model: "extract-model",
    finishedAt: "2026-09-24T00:02:00.000Z",
  });
  await repository.markExtraction(id.toHexString(), { status: "failed" }, { startedAt });
  await repository.markExtraction(id.toHexString(), { status: "running" });

  expect(saved?.id).toBe(id.toHexString());
  expect(filters).toEqual([
    { _id: id, status: "draft", ...run },
    { _id: id, ...run },
    { _id: id },
  ]);
});

test("countByPdfPathname counts every version that stores the blob path", async () => {
  let filter: unknown;
  activeCollection = readyCollection({
    countDocuments: async (value: unknown) => {
      filter = value;
      return 2;
    },
  });

  const count = await new MongoCvVersionRepository().countByPdfPathname("cv/test.pdf");

  expect(filter).toEqual({ "pdf.pathname": "cv/test.pdf" });
  expect(count).toBe(2);
});

for (const [name, changes] of [
  ["a published version", { status: "published" }],
  ["an archived version", { status: "archived" }],
  ["an unfinished extraction", { extractionStatus: "running" }],
  ["a version with missing data", { data: null }],
] as const) {
  test(`publish rejects ${name} before archiving`, async () => {
    const id = new TestObjectId();
    const document = makeDocument(id, changes);
    let archived = false;
    activeCollection = {
      findOne: async () => document,
      updateMany: async () => {
        archived = true;
      },
    };

    await expect(new MongoCvVersionRepository().publish(id.toHexString(), tx)).rejects.toMatchObject({
      name: "CvVersionStateError",
      message: "Only a draft with extracted CV data can be published.",
    });
    expect(archived).toBe(false);
  });
}

test("publish archives and promotes only an eligible draft in the same session", async () => {
  const id = new TestObjectId();
  const document = makeDocument(id);
  const calls: unknown[][] = [];
  activeCollection = {
    findOne: async (...args: unknown[]) => {
      calls.push(["findOne", ...args]);
      return document;
    },
    updateMany: async (...args: unknown[]) => {
      calls.push(["updateMany", ...args]);
    },
    findOneAndUpdate: async (...args: unknown[]) => {
      calls.push(["findOneAndUpdate", ...args]);
      return {
        ...document,
        status: "published",
        publishedAt: new Date("2026-09-24T01:00:00.000Z"),
      };
    },
  };

  const published = await new MongoCvVersionRepository().publish(id.toHexString(), tx);

  expect(published.status).toBe("published");
  expect(calls.map(([method]) => method)).toEqual(["findOne", "updateMany", "findOneAndUpdate"]);
  expect(calls[0]).toEqual(["findOne", { _id: id }, { session }]);
  expect(calls[1]?.[1]).toEqual({ status: "published" });
  expect(calls[1]?.[3]).toEqual({ session });
  expect(calls[2]?.[1]).toEqual({
    _id: id,
    status: "draft",
    "extraction.status": "succeeded",
    data: { $ne: null, $exists: true },
  });
  expect(calls[2]?.[3]).toEqual({ returnDocument: "after", session });
});

test("publish fails if the draft is no longer eligible when promoted", async () => {
  const id = new TestObjectId();
  activeCollection = {
    findOne: async () => makeDocument(id),
    updateMany: async () => undefined,
    findOneAndUpdate: async () => null,
  };

  await expect(new MongoCvVersionRepository().publish(id.toHexString(), tx)).rejects.toMatchObject({
    name: "CvVersionStateError",
    message: "The draft changed while it was being published. Reload and try again.",
  });
});
