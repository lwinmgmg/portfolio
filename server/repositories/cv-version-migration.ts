import type { Collection, Document } from "mongodb";

const INDEX_NOT_FOUND = 27;

export type MigrationCollection = Pick<Collection<Document>, "indexes" | "dropIndex" | "updateMany">;

// Phase 1.4 made `pdf.pathname` unique. Duplicated drafts now share that path, so the
// upload idempotency key moved to `uploadPathname`. Both steps are idempotent and safe
// when several instances run them at once, so they can run with every index build.
export async function migrateLegacyUploadKeys(collection: MigrationCollection): Promise<void> {
  await dropUniquePdfPathnameIndex(collection);
  // Copies carry `sourceVersionId` and never take the upload key of their source.
  await collection.updateMany(
    { uploadPathname: { $exists: false }, sourceVersionId: { $exists: false } },
    [{ $set: { uploadPathname: "$pdf.pathname" } }],
  );
}

async function dropUniquePdfPathnameIndex(collection: MigrationCollection): Promise<void> {
  for (const index of await collection.indexes()) {
    const keys = Object.keys(index.key);
    const isLegacy =
      index.unique === true && keys.length === 1 && keys[0] === "pdf.pathname";
    if (!isLegacy || !index.name) continue;
    try {
      await collection.dropIndex(index.name);
    } catch (error) {
      // Another instance dropped it first.
      if (!isIndexNotFound(error)) throw error;
    }
  }
}

function isIndexNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === INDEX_NOT_FOUND
  );
}
