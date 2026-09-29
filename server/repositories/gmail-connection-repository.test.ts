import { expect, test } from "bun:test";

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

const { MongoGmailConnectionRepository } = await import(
  "@/server/repositories/gmail-connection-repository"
);

type Call = { method: string; args: unknown[] };

function fakeCollection(found: unknown = null) {
  const calls: Call[] = [];
  const record =
    (method: string, result: unknown) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };
  activeCollection = {
    findOne: record("findOne", found),
    replaceOne: record("replaceOne", { acknowledged: true }),
    deleteOne: record("deleteOne", { deletedCount: 1 }),
  };
  return calls;
}

const connection = {
  email: "owner@gmail.com",
  refreshToken: "1//refresh",
  scopes: ["openid", "https://www.googleapis.com/auth/gmail.send"],
  connectedAt: "2026-09-29T10:00:00.000Z",
};

test("save replaces the single gmail document, with a BSON date", async () => {
  const calls = fakeCollection();
  await new MongoGmailConnectionRepository().save(connection);
  expect(calls).toEqual([
    {
      method: "replaceOne",
      args: [
        { _id: "gmail" },
        {
          email: "owner@gmail.com",
          refreshToken: "1//refresh",
          scopes: connection.scopes,
          connectedAt: new Date("2026-09-29T10:00:00.000Z"),
        },
        { upsert: true },
      ],
    },
  ]);
});

test("find maps the document back, or returns null", async () => {
  fakeCollection({ ...connection, _id: "gmail", connectedAt: new Date(connection.connectedAt) });
  expect(await new MongoGmailConnectionRepository().find()).toEqual(connection);

  const calls = fakeCollection(null);
  expect(await new MongoGmailConnectionRepository().find()).toBeNull();
  expect(calls).toEqual([{ method: "findOne", args: [{ _id: "gmail" }] }]);
});

test("remove deletes the gmail document", async () => {
  const calls = fakeCollection();
  await new MongoGmailConnectionRepository().remove();
  expect(calls).toEqual([{ method: "deleteOne", args: [{ _id: "gmail" }] }]);
});
