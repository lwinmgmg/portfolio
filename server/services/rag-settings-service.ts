import {
  InvalidRetrievalConfigError,
  type ChatRetrievalSettings,
  type RagSettingsRepository,
} from "@/server/domain/rag";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  RetrievalConfigSchema,
  retrievalConfigErrorMessage,
} from "@/server/rag/pipeline/retrieval-config";

type Warn = (message: string, detail: unknown) => void;

// The chat's retrieval config, tuned in the playground. The chat must never fail because of a
// stored config, so one that no longer parses gives the defaults instead of an error.
export class RagSettingsService {
  constructor(
    private readonly repository: RagSettingsRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly warn: Warn = (message, detail) => console.warn(message, detail),
  ) {}

  async chatSettings(): Promise<ChatRetrievalSettings> {
    const stored = await this.repository.findChatConfig();
    if (stored === null) return defaultSettings();
    const parsed = RetrievalConfigSchema.safeParse(stored.config);
    if (parsed.success) return { config: parsed.data, updatedAt: stored.updatedAt };
    this.warn(
      "The saved chat retrieval config no longer parses, so the chat uses the defaults.",
      retrievalConfigErrorMessage(parsed.error),
    );
    return defaultSettings();
  }

  // Throws InvalidRetrievalConfigError, whose message names the field, for a config that does not parse.
  async saveChatConfig(input: unknown): Promise<ChatRetrievalSettings> {
    const parsed = RetrievalConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidRetrievalConfigError(retrievalConfigErrorMessage(parsed.error));
    }
    const updatedAt = this.now().toISOString();
    await this.repository.saveChatConfig(parsed.data, updatedAt);
    return { config: parsed.data, updatedAt };
  }
}

function defaultSettings(): ChatRetrievalSettings {
  return { config: { ...DEFAULT_RETRIEVAL_CONFIG }, updatedAt: null };
}
