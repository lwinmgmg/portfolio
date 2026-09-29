import "server-only";

import type { Document, WithId } from "mongodb";

import {
  CHAT_CONVERSATION_TTL_SECONDS,
  EMAIL_DRAFT_TTL_MS,
  EMAIL_SEND_STUCK_MS,
  type Conversation,
  type ConversationRepository,
  type EmailDraft,
  type EmailDraftStore,
  type StoredMessage,
} from "@/server/domain/chat";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type StoredMessageDocument = Omit<StoredMessage, "createdAt"> & { createdAt: Date };

type EmailDraftDocument = Omit<EmailDraft, "createdAt" | "sentAt"> & {
  createdAt: Date;
  sentAt: Date | null;
  // Set when a Send claims the draft. Stored only, so a stuck `sending` draft can be aged.
  claimedAt?: Date;
};

// Drafts that hold a place in the send limits: sent, or claimed and still sending.
const COUNTS_AS_SENT = { $in: ["$$draft.status", ["sending", "sent"]] };

type ConversationDocument = {
  sessionId: string;
  messages: StoredMessageDocument[];
  // Absent in conversations stored before Phase 4.3.
  emailDrafts?: EmailDraftDocument[];
  createdAt: Date;
  updatedAt: Date;
};

export class MongoConversationRepository
  extends MongoRepository<Conversation, ConversationDocument>
  implements ConversationRepository, EmailDraftStore
{
  constructor(private readonly now: () => Date = () => new Date()) {
    super("chat_conversations");
  }

  protected toEntity(document: WithId<ConversationDocument>): Conversation {
    const stuckBefore = this.now().getTime() - EMAIL_SEND_STUCK_MS;
    return {
      id: document._id.toHexString(),
      sessionId: document.sessionId,
      messages: document.messages.map((message) => ({
        role: message.role,
        text: message.text,
        citedEntityKeys: [...message.citedEntityKeys],
        traceId: message.traceId,
        createdAt: message.createdAt.toISOString(),
      })),
      emailDrafts: (document.emailDrafts ?? []).map((draft) => ({
        id: draft.id,
        text: draft.text,
        // The claiming function died mid-send; failEmailDraftsStuckSince writes this later.
        status:
          draft.status === "sending" && draft.claimedAt && draft.claimedAt.getTime() < stuckBefore
            ? "failed"
            : draft.status,
        createdAt: draft.createdAt.toISOString(),
        sentAt: draft.sentAt ? draft.sentAt.toISOString() : null,
      })),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  protected override createIndexes(): Promise<unknown> {
    return Promise.all([
      this.collection().createIndex({ sessionId: 1 }),
      // Also serves the daily count, which filters on `updatedAt`.
      this.collection().createIndex(
        { updatedAt: 1 },
        { expireAfterSeconds: CHAT_CONVERSATION_TTL_SECONDS },
      ),
    ]);
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async findForSession(id: string, sessionId: string): Promise<Conversation | null> {
    const objectId = this.parseId(id);
    if (!objectId) return null;
    await this.ensureReady();
    const document = await this.collection().findOne({ _id: objectId, sessionId });
    return document ? this.toEntity(document) : null;
  }

  async create(sessionId: string): Promise<Conversation> {
    await this.ensureReady();
    const now = this.now();
    const document: ConversationDocument = {
      sessionId,
      messages: [],
      emailDrafts: [],
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.collection().insertOne(document);
    return this.toEntity({ ...document, _id: result.insertedId });
  }

  async append(id: string, messages: StoredMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const objectId = this.parseId(id);
    if (!objectId) throw new Error(`Conversation id "${id}" is not valid.`);
    const documents = messages.map((message) => ({
      role: message.role,
      text: message.text,
      citedEntityKeys: [...message.citedEntityKeys],
      traceId: message.traceId,
      createdAt: parseInstant(message.createdAt),
    }));
    const updatedAt = new Date(Math.max(...documents.map((message) => message.createdAt.getTime())));
    await this.ensureReady();
    await this.collection().updateOne(
      { _id: objectId },
      { $push: { messages: { $each: documents } }, $max: { updatedAt } },
    );
  }

  // One pipeline update, so superseding the older pending drafts and adding the new one cannot
  // be split by a concurrent write. The new draft goes in as a `$literal`: in a pipeline, a text
  // starting with `$` would otherwise be read as a field path.
  async addEmailDraft(conversationId: string, draft: EmailDraft): Promise<void> {
    const objectId = this.parseId(conversationId);
    if (!objectId) throw new Error(`Conversation id "${conversationId}" is not valid.`);
    const document: EmailDraftDocument = {
      id: draft.id,
      text: draft.text,
      status: draft.status,
      createdAt: parseInstant(draft.createdAt),
      sentAt: draft.sentAt === null ? null : parseInstant(draft.sentAt),
    };
    await this.ensureReady();
    const result = await this.collection().updateOne({ _id: objectId }, [
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
              [{ $literal: document }],
            ],
          },
          updatedAt: { $max: ["$updatedAt", document.createdAt] },
        },
      },
    ]);
    if (result.matchedCount === 0) {
      throw new Error(`Conversation "${conversationId}" was not found.`);
    }
  }

  // One findOneAndUpdate, so two Sends of the same draft cannot both claim it: the second finds
  // it no longer `pending`. Gmail has no idempotency key, so this claim is the at-most-once rule.
  async claimEmailDraft(
    conversationId: string,
    sessionId: string,
    draftId: string,
    now: Date,
  ): Promise<EmailDraft | null> {
    const objectId = this.parseId(conversationId);
    if (!objectId) return null;
    await this.ensureReady();
    const document = await this.collection().findOneAndUpdate(
      {
        _id: objectId,
        sessionId,
        emailDrafts: {
          $elemMatch: {
            id: draftId,
            status: "pending",
            createdAt: { $gt: new Date(now.getTime() - EMAIL_DRAFT_TTL_MS) },
          },
        },
        // The newest draft only. A literal, so an id starting with `$` is not a field path.
        $expr: { $eq: [{ $arrayElemAt: ["$emailDrafts.id", -1] }, { $literal: draftId }] },
      },
      {
        $set: { "emailDrafts.$.status": "sending", "emailDrafts.$.claimedAt": now },
        $max: { updatedAt: now },
      },
      { returnDocument: "after" },
    );
    if (!document) return null;
    return this.toEntity(document).emailDrafts.find((draft) => draft.id === draftId) ?? null;
  }

  // Only a `sending` draft moves, so a late mark cannot undo a discard or a newer outcome.
  async markEmailDraft(
    conversationId: string,
    draftId: string,
    status: "sent" | "failed",
    at: Date,
  ): Promise<void> {
    const objectId = this.parseId(conversationId);
    if (!objectId) throw new Error(`Conversation id "${conversationId}" is not valid.`);
    await this.ensureReady();
    await this.collection().updateOne(
      { _id: objectId, emailDrafts: { $elemMatch: { id: draftId, status: "sending" } } },
      {
        $set: {
          "emailDrafts.$.status": status,
          "emailDrafts.$.sentAt": status === "sent" ? at : null,
        },
        $max: { updatedAt: at },
      },
    );
  }

  async discardEmailDraft(
    conversationId: string,
    sessionId: string,
    draftId: string,
  ): Promise<boolean> {
    const objectId = this.parseId(conversationId);
    if (!objectId) return false;
    await this.ensureReady();
    const result = await this.collection().updateOne(
      {
        _id: objectId,
        sessionId,
        emailDrafts: { $elemMatch: { id: draftId, status: "pending" } },
      },
      { $set: { "emailDrafts.$.status": "discarded" } },
    );
    return result.matchedCount > 0;
  }

  async countSentEmailsForSession(sessionId: string): Promise<number> {
    await this.ensureReady();
    return this.sumMatching({ sessionId }, "emailDrafts", "draft", COUNTS_AS_SENT);
  }

  // A claim moves `updatedAt` to the claim time, so the TTL index narrows the scan here too.
  async countSentEmailsSince(since: Date): Promise<number> {
    await this.ensureReady();
    return this.sumMatching({ updatedAt: { $gte: since } }, "emailDrafts", "draft", {
      $and: [COUNTS_AS_SENT, { $gte: ["$$draft.claimedAt", since] }],
    });
  }

  // Scans the collection: it holds 30 days of conversations and runs once per Send.
  async failEmailDraftsStuckSince(claimedBefore: Date): Promise<void> {
    await this.ensureReady();
    await this.collection().updateMany(
      { emailDrafts: { $elemMatch: { status: "sending", claimedAt: { $lt: claimedBefore } } } },
      { $set: { "emailDrafts.$[stuck].status": "failed" } },
      {
        arrayFilters: [{ "stuck.status": "sending", "stuck.claimedAt": { $lt: claimedBefore } }],
      },
    );
  }

  async countUserMessagesForSession(sessionId: string): Promise<number> {
    await this.ensureReady();
    return this.sumMatching({ sessionId }, "messages", "message", {
      $eq: ["$$message.role", "user"],
    });
  }

  // A conversation with a message since `since` was updated since then, so the TTL index narrows
  // the scan before the messages are counted.
  async countUserMessagesSince(since: Date): Promise<number> {
    await this.ensureReady();
    return this.sumMatching({ updatedAt: { $gte: since } }, "messages", "message", {
      $and: [
        { $eq: ["$$message.role", "user"] },
        { $gte: ["$$message.createdAt", since] },
      ],
    });
  }

  // Counts the array items that pass `cond` across the matching conversations.
  private async sumMatching(
    match: Document,
    field: "messages" | "emailDrafts",
    as: string,
    cond: Document,
  ): Promise<number> {
    const [row] = await this.collection()
      .aggregate<{ total: number }>([
        { $match: match },
        {
          $project: {
            count: {
              $size: {
                // Conversations stored before Phase 4.3 have no `emailDrafts`.
                $filter: { input: { $ifNull: [`$${field}`, []] }, as, cond },
              },
            },
          },
        },
        { $group: { _id: null, total: { $sum: "$count" } } },
      ])
      .toArray();
    return row?.total ?? 0;
  }
}
