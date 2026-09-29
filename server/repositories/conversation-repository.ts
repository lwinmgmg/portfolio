import "server-only";

import type { Document, WithId } from "mongodb";

import {
  CHAT_CONVERSATION_TTL_SECONDS,
  type Conversation,
  type ConversationRepository,
  type EmailDraft,
  type StoredMessage,
} from "@/server/domain/chat";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

type StoredMessageDocument = Omit<StoredMessage, "createdAt"> & { createdAt: Date };

type EmailDraftDocument = Omit<EmailDraft, "createdAt" | "sentAt"> & {
  createdAt: Date;
  sentAt: Date | null;
};

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
  implements ConversationRepository
{
  constructor(private readonly now: () => Date = () => new Date()) {
    super("chat_conversations");
  }

  protected toEntity(document: WithId<ConversationDocument>): Conversation {
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
        status: draft.status,
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

  async countUserMessagesForSession(sessionId: string): Promise<number> {
    await this.ensureReady();
    return this.sumUserMessages({ sessionId }, { $eq: ["$$message.role", "user"] });
  }

  // A conversation with a message since `since` was updated since then, so the TTL index narrows
  // the scan before the messages are counted.
  async countUserMessagesSince(since: Date): Promise<number> {
    await this.ensureReady();
    return this.sumUserMessages(
      { updatedAt: { $gte: since } },
      {
        $and: [
          { $eq: ["$$message.role", "user"] },
          { $gte: ["$$message.createdAt", since] },
        ],
      },
    );
  }

  private async sumUserMessages(match: Document, messageFilter: Document): Promise<number> {
    const [row] = await this.collection()
      .aggregate<{ total: number }>([
        { $match: match },
        {
          $project: {
            count: {
              $size: {
                $filter: { input: "$messages", as: "message", cond: messageFilter },
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
