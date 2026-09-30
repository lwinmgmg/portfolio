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
    feedback: null,
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
            feedback: null,
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
      feedback: null,
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
            feedback: null,
            createdAt: new Date("2026-09-29T10:00:00.000Z"),
          },
          {
            role: "assistant",
            text: "assistant text",
            citedEntityKeys: ["experience:acme"],
            traceId: "trace-1",
            feedback: null,
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

test("a draft still sending two minutes after its claim reads as failed", async () => {
  const draft = (id: string, claimedAt: Date) => ({
    id,
    text: "Hi",
    status: "sending",
    createdAt: now,
    sentAt: null,
    claimedAt,
  });
  activeCollection = readyCollection({
    findOne: async () => ({
      _id: new TestObjectId(conversationId),
      sessionId: "s",
      messages: [],
      emailDrafts: [
        draft("stuck", new Date(now.getTime() - 120_001)),
        draft("in-flight", new Date(now.getTime() - 119_999)),
      ],
      createdAt: now,
      updatedAt: now,
    }),
  });

  const conversation = await new MongoConversationRepository(() => now).findForSession(
    conversationId,
    "s",
  );

  expect(conversation?.emailDrafts.map((item) => [item.id, item.status])).toEqual([
    ["stuck", "failed"],
    ["in-flight", "sending"],
  ]);
});

test("claimEmailDraft moves the session's newest young pending draft to sending in one update", async () => {
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    findOneAndUpdate: async (...args: unknown[]) => {
      calls.push(args);
      return {
        _id: new TestObjectId(conversationId),
        sessionId: "s1",
        messages: [],
        emailDrafts: [
          { id: "d1", text: "Old", status: "superseded", createdAt: now, sentAt: null },
          { id: "d2", text: "Hi", status: "sending", createdAt: now, sentAt: null, claimedAt: now },
        ],
        createdAt: now,
        updatedAt: now,
      };
    },
  });

  const draft = await new MongoConversationRepository(() => now).claimEmailDraft(
    conversationId,
    "s1",
    "d2",
    now,
  );

  expect(draft).toEqual({
    id: "d2",
    text: "Hi",
    status: "sending",
    createdAt: now.toISOString(),
    sentAt: null,
  });
  const [filter, update, options] = calls[0] as [Record<string, unknown>, unknown, unknown];
  expect((filter._id as TestObjectId).toHexString()).toBe(conversationId);
  expect({ ...filter, _id: undefined }).toEqual({
    _id: undefined,
    sessionId: "s1",
    emailDrafts: {
      $elemMatch: {
        id: "d2",
        status: "pending",
        createdAt: { $gt: new Date("2026-09-29T09:00:00.000Z") },
      },
    },
    $expr: { $eq: [{ $arrayElemAt: ["$emailDrafts.id", -1] }, { $literal: "d2" }] },
  });
  expect(update).toEqual({
    $set: { "emailDrafts.$.status": "sending", "emailDrafts.$.claimedAt": now },
    $max: { updatedAt: now },
  });
  expect(options).toEqual({ returnDocument: "after" });
});

test("claimEmailDraft returns null when nothing matched or the id is malformed", async () => {
  let queried = 0;
  activeCollection = readyCollection({
    findOneAndUpdate: async () => {
      queried += 1;
      return null;
    },
  });
  const repository = new MongoConversationRepository(() => now);

  expect(await repository.claimEmailDraft(conversationId, "s1", "d1", now)).toBeNull();
  expect(await repository.claimEmailDraft("nope", "s1", "d1", now)).toBeNull();
  expect(queried).toBe(1);
});

test("markEmailDraft moves only a sending draft, with sentAt only when sent", async () => {
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    updateOne: async (...args: unknown[]) => {
      calls.push(args);
      return { matchedCount: 1 };
    },
  });
  const repository = new MongoConversationRepository();

  await repository.markEmailDraft(conversationId, "d1", "sent", now);
  await repository.markEmailDraft(conversationId, "d2", "failed", now);

  const [sentFilter, sentUpdate] = calls[0] as [Record<string, unknown>, unknown];
  expect(sentFilter.emailDrafts).toEqual({ $elemMatch: { id: "d1", status: "sending" } });
  expect(sentUpdate).toEqual({
    $set: { "emailDrafts.$.status": "sent", "emailDrafts.$.sentAt": now },
    $max: { updatedAt: now },
  });
  expect((calls[1] as [unknown, { $set: unknown }])[1].$set).toEqual({
    "emailDrafts.$.status": "failed",
    "emailDrafts.$.sentAt": null,
  });
  await expect(repository.markEmailDraft("nope", "d1", "sent", now)).rejects.toMatchObject({
    message: 'Conversation id "nope" is not valid.',
  });
});

test("discardEmailDraft discards the session's pending draft and says whether it matched", async () => {
  const calls: unknown[][] = [];
  const matched = [1, 0];
  activeCollection = readyCollection({
    updateOne: async (...args: unknown[]) => {
      calls.push(args);
      return { matchedCount: matched.shift() ?? 0 };
    },
  });
  const repository = new MongoConversationRepository();

  expect(await repository.discardEmailDraft(conversationId, "s1", "d1")).toBe(true);
  expect(await repository.discardEmailDraft(conversationId, "s1", "d1")).toBe(false);
  expect(await repository.discardEmailDraft("nope", "s1", "d1")).toBe(false);

  expect(calls).toHaveLength(2);
  const [filter, update] = calls[0] as [Record<string, unknown>, unknown];
  expect(filter.sessionId).toBe("s1");
  expect(filter.emailDrafts).toEqual({ $elemMatch: { id: "d1", status: "pending" } });
  expect(update).toEqual({ $set: { "emailDrafts.$.status": "discarded" } });
});

test("sent-email counts include in-flight sends; the daily one goes by claim time", async () => {
  const pipelines: unknown[] = [];
  const totals = [[{ total: 2 }], [{ total: 5 }]];
  activeCollection = readyCollection({
    aggregate: (pipeline: unknown) => {
      pipelines.push(pipeline);
      const rows = totals.shift() ?? [];
      return { toArray: async () => rows };
    },
  });
  const repository = new MongoConversationRepository();
  const since = new Date("2026-09-29T00:00:00.000Z");

  expect(await repository.countSentEmailsForSession("s1")).toBe(2);
  expect(await repository.countSentEmailsSince(since)).toBe(5);

  type Stage = { $match?: unknown; $project?: { count: { $size: { $filter: unknown } } } };
  const [forSession, forDay] = pipelines as [Stage[], Stage[]];
  const sentOrSending = { $in: ["$$draft.status", ["sending", "sent"]] };
  expect(forSession[0]?.$match).toEqual({ sessionId: "s1" });
  expect(forSession[1]?.$project?.count.$size.$filter).toEqual({
    input: { $ifNull: ["$emailDrafts", []] },
    as: "draft",
    cond: sentOrSending,
  });
  expect(forDay[0]?.$match).toEqual({ updatedAt: { $gte: since } });
  expect(forDay[1]?.$project?.count.$size.$filter).toEqual({
    input: { $ifNull: ["$emailDrafts", []] },
    as: "draft",
    cond: { $and: [sentOrSending, { $gte: ["$$draft.claimedAt", since] }] },
  });
});

test("failEmailDraftsStuckSince fails every draft claimed before the cutoff and still sending", async () => {
  const calls: unknown[][] = [];
  activeCollection = readyCollection({
    updateMany: async (...args: unknown[]) => {
      calls.push(args);
      return { matchedCount: 0 };
    },
  });
  const cutoff = new Date("2026-09-29T09:58:00.000Z");

  await new MongoConversationRepository().failEmailDraftsStuckSince(cutoff);

  expect(calls).toEqual([
    [
      { emailDrafts: { $elemMatch: { status: "sending", claimedAt: { $lt: cutoff } } } },
      { $set: { "emailDrafts.$[stuck].status": "failed" } },
      { arrayFilters: [{ "stuck.status": "sending", "stuck.claimedAt": { $lt: cutoff } }] },
    ],
  ]);
});

test("setFeedback rates only an assistant message of the session's conversation", async () => {
  const calls: unknown[][] = [];
  const matched = [1, 0];
  activeCollection = readyCollection({
    updateOne: async (...args: unknown[]) => {
      calls.push(args);
      return { matchedCount: matched.shift() ?? 0 };
    },
  });
  const repository = new MongoConversationRepository();

  expect(await repository.setFeedback(conversationId, "s1", 3, "down")).toBe(true);
  expect(await repository.setFeedback(conversationId, "s1", 1, "up")).toBe(false);
  expect(await repository.setFeedback("nope", "s1", 1, "up")).toBe(false);
  expect(await repository.setFeedback(conversationId, "s1", -1, "up")).toBe(false);
  expect(await repository.setFeedback(conversationId, "s1", 1.5, "up")).toBe(false);

  expect(calls).toHaveLength(2);
  const [filter, update] = calls[0] as [Record<string, unknown>, unknown];
  expect(filter.sessionId).toBe("s1");
  expect(filter["messages.3.role"]).toBe("assistant");
  expect(update).toEqual({ $set: { "messages.3.feedback": "down" } });
});

test("feedbackByTraceId maps rated traces, and reads nothing for no ids", async () => {
  let aggregated = 0;
  activeCollection = readyCollection({
    aggregate: () => {
      aggregated += 1;
      return {
        toArray: async () => [
          { traceId: "t1", feedback: "down" },
          { traceId: "t3", feedback: "up" },
        ],
      };
    },
  });
  const repository = new MongoConversationRepository();

  expect(await repository.feedbackByTraceId([])).toEqual(new Map());
  expect(aggregated).toBe(0);
  expect(await repository.feedbackByTraceId(["t1", "t2", "t3"])).toEqual(
    new Map([
      ["t1", "down"],
      ["t3", "up"],
    ]),
  );
});

test("traceIdsWithFeedback lists the trace ids of answers with that thumb", async () => {
  const pipelines: unknown[] = [];
  activeCollection = readyCollection({
    aggregate: (pipeline: unknown) => {
      pipelines.push(pipeline);
      return { toArray: async () => [{ traceId: "t1" }, { traceId: "t9" }] };
    },
  });
  const repository = new MongoConversationRepository();

  expect(await repository.traceIdsWithFeedback("down", 50)).toEqual(["t1", "t9"]);
  expect(JSON.stringify(pipelines[0])).toContain('"feedback":"down"');
});
