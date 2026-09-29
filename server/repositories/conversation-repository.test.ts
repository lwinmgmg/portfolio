import { expect, test } from "bun:test";

import type { StoredMessage } from "@/server/domain/chat";

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

const { MongoConversationRepository } = await import(
  "@/server/repositories/conversation-repository"
);

const conversationId = "65f1f77bcf86cd7994390111";
const now = new Date("2026-09-29T10:00:00.000Z");

function readyCollection(extra: Record<string, unknown> = {}) {
  return { createIndex: async () => undefined, ...extra };
}

function message(role: StoredMessage["role"], createdAt: string): StoredMessage {
  return {
    role,
    text: `${role} text`,
    citedEntityKeys: role === "assistant" ? ["experience:acme"] : [],
    traceId: role === "assistant" ? "trace-1" : null,
    createdAt,
  };
}

test("conversations are indexed by session and expire 30 days after the last message", async () => {
  const indexes: unknown[][] = [];
  activeCollection = {
    createIndex: async (...args: unknown[]) => {
      indexes.push(args);
    },
  };

  await new MongoConversationRepository().ensureReady();

  expect(indexes).toEqual([
    [{ sessionId: 1 }],
    [{ updatedAt: 1 }, { expireAfterSeconds: 2_592_000 }],
  ]);
});

test("create stores an empty conversation for the session", async () => {
  let stored: unknown;
  activeCollection = readyCollection({
    insertOne: async (document: unknown) => {
      stored = document;
      return { insertedId: new TestObjectId(conversationId) };
    },
  });

  const conversation = await new MongoConversationRepository(() => now).create("session-1");

  expect(stored).toEqual({
    sessionId: "session-1",
    messages: [],
    emailDrafts: [],
    createdAt: now,
    updatedAt: now,
  });
  expect(conversation).toEqual({
    id: conversationId,
    sessionId: "session-1",
    messages: [],
    emailDrafts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
});

test("findForSession filters by id and owner and maps dates to ISO strings", async () => {
  let filter: { _id: TestObjectId; sessionId: string } | undefined;
  activeCollection = readyCollection({
    findOne: async (value: { _id: TestObjectId; sessionId: string }) => {
      filter = value;
      return {
        _id: value._id,
        sessionId: "session-1",
        messages: [
          {
            role: "assistant",
            text: "Hi [S1]",
            citedEntityKeys: ["profile"],
            traceId: "trace-1",
            createdAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
    },
  });

  const conversation = await new MongoConversationRepository().findForSession(
    conversationId,
    "session-1",
  );

  expect(filter?._id.toHexString()).toBe(conversationId);
  expect(filter?.sessionId).toBe("session-1");
  expect(conversation?.messages).toEqual([
    {
      role: "assistant",
      text: "Hi [S1]",
      citedEntityKeys: ["profile"],
      traceId: "trace-1",
      createdAt: now.toISOString(),
    },
  ]);
});

test("a conversation stored before email drafts reads with none; drafts map to ISO strings", async () => {
  const documents = [
    { _id: new TestObjectId(conversationId), sessionId: "s", messages: [], createdAt: now, updatedAt: now },
    {
      _id: new TestObjectId(conversationId),
      sessionId: "s",
      messages: [],
      emailDrafts: [
        { id: "d1", text: "Hi", status: "sent", createdAt: now, sentAt: now },
        { id: "d2", text: "Hello", status: "pending", createdAt: now, sentAt: null },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
  activeCollection = readyCollection({ findOne: async () => documents.shift() ?? null });
  const repository = new MongoConversationRepository();

  expect((await repository.findForSession(conversationId, "s"))?.emailDrafts).toEqual([]);
  expect((await repository.findForSession(conversationId, "s"))?.emailDrafts).toEqual([
    { id: "d1", text: "Hi", status: "sent", createdAt: now.toISOString(), sentAt: now.toISOString() },
    { id: "d2", text: "Hello", status: "pending", createdAt: now.toISOString(), sentAt: null },
  ]);
});

test("addEmailDraft supersedes pending drafts and adds the new one in a single pipeline update", async () => {
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    updateOne: async (...args: unknown[]) => {
      calls.push(args);
      return { matchedCount: 1 };
    },
  });

  await new MongoConversationRepository().addEmailDraft(conversationId, {
    id: "draft-2",
    text: "$where: I'm Jane",
    status: "pending",
    createdAt: "2026-09-29T10:00:05.000Z",
    sentAt: null,
  });

  expect(calls).toHaveLength(1);
  const [filter, update] = calls[0] as [{ _id: TestObjectId }, unknown];
  expect(filter._id.toHexString()).toBe(conversationId);
  const createdAt = new Date("2026-09-29T10:00:05.000Z");
  expect(update).toEqual([
    {
      $set: {
        emailDrafts: {
          $concatArrays: [
            {
              $map: {
                input: { $ifNull: ["$emailDrafts", []] },
                as: "draft",
                in: {
                  $cond: [
                    { $eq: ["$$draft.status", "pending"] },
                    { $mergeObjects: ["$$draft", { status: "superseded" }] },
                    "$$draft",
                  ],
                },
              },
            },
            // A literal, so text starting with `$` is not read as a field path.
            [
              {
                $literal: {
                  id: "draft-2",
                  text: "$where: I'm Jane",
                  status: "pending",
                  createdAt,
                  sentAt: null,
                },
              },
            ],
          ],
        },
        updatedAt: { $max: ["$updatedAt", createdAt] },
      },
    },
  ]);
});

test("addEmailDraft throws for a malformed or missing conversation", async () => {
  activeCollection = readyCollection({ updateOne: async () => ({ matchedCount: 0 }) });
  const repository = new MongoConversationRepository();
  const draft = {
    id: "d",
    text: "t",
    status: "pending" as const,
    createdAt: "2026-09-29T10:00:00.000Z",
    sentAt: null,
  };

  await expect(repository.addEmailDraft("nope", draft)).rejects.toMatchObject({
    message: 'Conversation id "nope" is not valid.',
  });
  await expect(repository.addEmailDraft(conversationId, draft)).rejects.toMatchObject({
    message: `Conversation "${conversationId}" was not found.`,
  });
});

test("findForSession returns null for a malformed id without a query", async () => {
  let queried = false;
  activeCollection = readyCollection({
    findOne: async () => {
      queried = true;
      return null;
    },
  });

  expect(await new MongoConversationRepository().findForSession("nope", "session-1")).toBeNull();
  expect(queried).toBe(false);
});

test("append pushes the messages as BSON dates and moves updatedAt forward", async () => {
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    updateOne: async (...args: unknown[]) => {
      calls.push(args);
    },
  });

  await new MongoConversationRepository().append(conversationId, [
    message("user", "2026-09-29T10:00:00.000Z"),
    message("assistant", "2026-09-29T10:00:05.000Z"),
  ]);

  expect(calls).toHaveLength(1);
  const [filter, update] = calls[0] as [{ _id: TestObjectId }, unknown];
  expect(filter._id.toHexString()).toBe(conversationId);
  expect(update).toEqual({
    $push: {
      messages: {
        $each: [
          {
            role: "user",
            text: "user text",
            citedEntityKeys: [],
            traceId: null,
            createdAt: new Date("2026-09-29T10:00:00.000Z"),
          },
          {
            role: "assistant",
            text: "assistant text",
            citedEntityKeys: ["experience:acme"],
            traceId: "trace-1",
            createdAt: new Date("2026-09-29T10:00:05.000Z"),
          },
        ],
      },
    },
    $max: { updatedAt: new Date("2026-09-29T10:00:05.000Z") },
  });
});

test("append with no messages writes nothing", async () => {
  let written = false;
  activeCollection = readyCollection({
    updateOne: async () => {
      written = true;
    },
  });

  await new MongoConversationRepository().append(conversationId, []);

  expect(written).toBe(false);
});

test("counts sum the user messages of the matching conversations", async () => {
  const pipelines: unknown[] = [];
  const totals = [[{ total: 7 }], []];
  activeCollection = readyCollection({
    aggregate: (pipeline: unknown) => {
      pipelines.push(pipeline);
      const rows = totals.shift() ?? [];
      return { toArray: async () => rows };
    },
  });
  const repository = new MongoConversationRepository();
  const since = new Date("2026-09-29T00:00:00.000Z");

  expect(await repository.countUserMessagesForSession("session-1")).toBe(7);
  expect(await repository.countUserMessagesSince(since)).toBe(0);

  const [forSession, forDay] = pipelines as [
    { $match?: unknown; $project?: { count: { $size: { $filter: { cond: unknown } } } } }[],
    { $match?: unknown; $project?: { count: { $size: { $filter: { cond: unknown } } } } }[],
  ];
  expect(forSession[0]?.$match).toEqual({ sessionId: "session-1" });
  expect(forSession[1]?.$project?.count.$size.$filter.cond).toEqual({
    $eq: ["$$message.role", "user"],
  });
  expect(forDay[0]?.$match).toEqual({ updatedAt: { $gte: since } });
  expect(forDay[1]?.$project?.count.$size.$filter.cond).toEqual({
    $and: [{ $eq: ["$$message.role", "user"] }, { $gte: ["$$message.createdAt", since] }],
  });
});
