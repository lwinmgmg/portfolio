import { z } from "zod";

import { RagError, type ChunkerKind, type IndexConfig } from "@/server/domain/rag";
import type { LlmEnv } from "@/server/llm/llm-env";
import { CHUNKER_KINDS } from "@/server/rag/indexing/chunker-kinds";

export type IndexModels = Pick<LlmEnv, "EMBEDDING_MODEL" | "LLM_UTILITY_MODEL">;

const ModelSchema = z.string().trim().min(1);

// `contextModel` records which model wrote the contexts, so it is set exactly when contextualizing.
export const IndexConfigSchema = z
  .strictObject({
    chunker: z.enum(CHUNKER_KINDS),
    contextualize: z.boolean(),
    embeddingModel: ModelSchema,
    contextModel: ModelSchema.nullable(),
  })
  .refine((config) => config.contextualize === (config.contextModel !== null), {
    message: "contextModel must be set exactly when contextualize is true.",
    path: ["contextModel"],
  }) satisfies z.ZodType<IndexConfig>;

export class InvalidIndexConfigError extends RagError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIndexConfigError";
  }
}

export function parseIndexConfig(input: unknown): IndexConfig {
  const parsed = IndexConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new InvalidIndexConfigError(issue ? issue.message : "The index settings are invalid.");
  }
  return parsed.data;
}

// The admin picks the chunker and whether to contextualize; the models come from the env.
export function indexConfigFor(
  choice: { chunker: ChunkerKind; contextualize: boolean },
  models: IndexModels,
): IndexConfig {
  return {
    chunker: choice.chunker,
    contextualize: choice.contextualize,
    embeddingModel: models.EMBEDDING_MODEL,
    contextModel: choice.contextualize ? models.LLM_UTILITY_MODEL : null,
  };
}

// Built and activated on every CV publish.
export function defaultIndexConfig(models: IndexModels): IndexConfig {
  return indexConfigFor({ chunker: "structured", contextualize: true }, models);
}
