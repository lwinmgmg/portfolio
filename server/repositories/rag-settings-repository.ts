import "server-only";

import type { WithId } from "mongodb";

import type { RagSettingsRepository, RetrievalConfig } from "@/server/domain/rag";
import { parseInstant } from "@/server/repositories/mongo-dates";
import { MongoRepository } from "@/server/repositories/mongo-repository";

const CHAT_SETTINGS_ID = "chat";

// One document per setting, keyed by name. `retrieval` is kept as saved; the service parses it.
type RagSettingsDocument = {
  _id: string;
  retrieval: unknown;
  updatedAt: Date;
};

type StoredSetting = { id: string; config: unknown; updatedAt: string };

export class MongoRagSettingsRepository
  extends MongoRepository<StoredSetting, RagSettingsDocument>
  implements RagSettingsRepository
{
  constructor() {
    super("rag_settings");
  }

  protected toEntity(document: WithId<RagSettingsDocument>): StoredSetting {
    return {
      id: document._id,
      config: document.retrieval,
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  ensureReady(): Promise<void> {
    return this.ensureIndexes();
  }

  async findChatConfig(): Promise<{ config: unknown; updatedAt: string } | null> {
    await this.ensureReady();
    const document = await this.collection().findOne({ _id: CHAT_SETTINGS_ID });
    if (!document) return null;
    const { config, updatedAt } = this.toEntity(document);
    return { config, updatedAt };
  }

  async saveChatConfig(config: RetrievalConfig, updatedAt: string): Promise<void> {
    await this.ensureReady();
    await this.collection().updateOne(
      { _id: CHAT_SETTINGS_ID },
      { $set: { retrieval: { ...config }, updatedAt: parseInstant(updatedAt) } },
      { upsert: true },
    );
  }
}
