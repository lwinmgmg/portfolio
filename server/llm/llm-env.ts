import { z } from "zod";

const DEFAULT_APP_NAME = "portfolio";
const DEFAULT_EXTRACT_MODEL = "deepseek/deepseek-v4.1-flash";
const DEFAULT_PDF_ENGINE = "native";
const DEFAULT_UTILITY_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const DEFAULT_ANSWER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const DEFAULT_EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b:free";
const DEFAULT_RERANK_MODEL = "nvidia/llama-nemotron-rerank-vl-1b-v2:free";
const DEFAULT_CHAT_DAILY_MESSAGE_LIMIT = 500;

const PdfEngineSchema = z.enum(["native", "cloudflare-ai", "mistral-ocr"]);

// Blank strings are unset, so defaults apply. A present invalid value fails.
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function stringWithDefault(fallback: string) {
  return z.preprocess(blankToUndefined, z.string().min(1).default(fallback));
}

const DailyMessageLimitSchema = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().positive().default(DEFAULT_CHAT_DAILY_MESSAGE_LIMIT),
);

export const LlmEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1),
  OPENROUTER_APP_URL: z.preprocess(
    blankToUndefined,
    z.string().min(1).optional(),
  ),
  OPENROUTER_APP_NAME: stringWithDefault(DEFAULT_APP_NAME),
  LLM_EXTRACT_MODEL: stringWithDefault(DEFAULT_EXTRACT_MODEL),
  LLM_PDF_ENGINE: z.preprocess(
    blankToUndefined,
    PdfEngineSchema.default(DEFAULT_PDF_ENGINE),
  ),
  LLM_UTILITY_MODEL: stringWithDefault(DEFAULT_UTILITY_MODEL),
  LLM_ANSWER_MODEL: stringWithDefault(DEFAULT_ANSWER_MODEL),
  EMBEDDING_MODEL: stringWithDefault(DEFAULT_EMBEDDING_MODEL),
  RERANK_MODEL: stringWithDefault(DEFAULT_RERANK_MODEL),
  CHAT_DAILY_MESSAGE_LIMIT: DailyMessageLimitSchema,
});

export type LlmEnv = z.infer<typeof LlmEnvSchema>;

export function readLlmEnv(
  env: Record<string, string | undefined> = process.env,
): LlmEnv | null {
  const parsed = LlmEnvSchema.safeParse({
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    OPENROUTER_APP_URL: env.OPENROUTER_APP_URL,
    OPENROUTER_APP_NAME: env.OPENROUTER_APP_NAME,
    LLM_EXTRACT_MODEL: env.LLM_EXTRACT_MODEL,
    LLM_PDF_ENGINE: env.LLM_PDF_ENGINE,
    LLM_UTILITY_MODEL: env.LLM_UTILITY_MODEL,
    LLM_ANSWER_MODEL: env.LLM_ANSWER_MODEL,
    EMBEDDING_MODEL: env.EMBEDDING_MODEL,
    RERANK_MODEL: env.RERANK_MODEL,
    CHAT_DAILY_MESSAGE_LIMIT: env.CHAT_DAILY_MESSAGE_LIMIT,
  });
  if (!parsed.success) return null;
  return parsed.data;
}
