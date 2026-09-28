import { expect, test } from "bun:test";

import {
  migrateLegacyUploadKeys,
  type MigrationCollection,
} from "@/server/repositories/cv-version-migration";

type IndexInfo = { name?: string; key: Record<string, number>; unique?: boolean };

function fakeCollection(indexes: IndexInfo[], dropError: unknown = null) {
  const dropped: string[] = [];
  const updates: unknown[][] = [];
  const collection = {
    indexes: async () => indexes,
    dropIndex: async (name: string) => {
      if (dropError) throw dropError;
      dropped.push(name);
    },
    updateMany: async (...args: unknown[]) => {
      updates.push(args);
    },
  };
  return { collection: collection as unknown as MigrationCollection, dropped, updates };
}

test("migrateLegacyUploadKeys drops the unique path index and backfills original uploads", async () => {
  const { collection, dropped, updates } = fakeCollection([
    { name: "_id_", key: { _id: 1 } },
    { name: "pdf.pathname_1", key: { "pdf.pathname": 1 }, unique: true },
  ]);

  await migrateLegacyUploadKeys(collection);

  expect(dropped).toEqual(["pdf.pathname_1"]);
  expect(updates[0]?.[0]).toEqual({
    uploadPathname: { $exists: false },
    sourceVersionId: { $exists: false },
  });
  expect(updates[0]?.[1]).toEqual([{ $set: { uploadPathname: "$pdf.pathname" } }]);
});

test("migrateLegacyUploadKeys keeps a shared path index", async () => {
  const { collection, dropped } = fakeCollection([
    { name: "pdf.pathname_1", key: { "pdf.pathname": 1 }, unique: false },
  ]);

  await migrateLegacyUploadKeys(collection);

  expect(dropped).toEqual([]);
});

test("migrateLegacyUploadKeys tolerates an index another instance already dropped", async () => {
  const notFound = Object.assign(new Error("index not found"), { code: 27 });
  const { collection, updates } = fakeCollection(
    [{ name: "pdf.pathname_1", key: { "pdf.pathname": 1 }, unique: true }],
    notFound,
  );

  await migrateLegacyUploadKeys(collection);

  expect(updates.length).toBe(1);
});

test("migrateLegacyUploadKeys rethrows any other drop failure", async () => {
  const { collection } = fakeCollection(
    [{ name: "pdf.pathname_1", key: { "pdf.pathname": 1 }, unique: true }],
    new Error("not authorized"),
  );

  await expect(migrateLegacyUploadKeys(collection)).rejects.toMatchObject({
    message: "not authorized",
  });
});
