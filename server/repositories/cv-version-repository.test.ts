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

test("ensureReady creates a unique index for each PDF pathname", async () => {
  const indexes: unknown[][] = [];
  activeCollection = {
    createIndex: async (...args: unknown[]) => {
      indexes.push(args);
    },
  };

  await new MongoCvVersionRepository().ensureReady();

  expect(indexes[1]).toEqual([{ "pdf.pathname": 1 }, { unique: true }]);
});

test("findByPdfPathname looks up the stored path", async () => {
  const document = makeDocument(new TestObjectId());
  let filter: unknown;
  activeCollection = {
    findOne: async (value: unknown) => {
      filter = value;
      return document;
    },
  };

  const found = await new MongoCvVersionRepository().findByPdfPathname("cv/test.pdf");

  expect(filter).toEqual({ "pdf.pathname": "cv/test.pdf" });
  expect(found?.pdf.pathname).toBe("cv/test.pdf");
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
      message: `CV version "${id.toHexString()}" must be a complete draft to publish.`,
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
    message: `CV version "${id.toHexString()}" is no longer a complete draft to publish.`,
  });
});
