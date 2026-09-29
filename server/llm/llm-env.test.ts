import { expect, test } from "bun:test";

import { readLlmEnv } from "@/server/llm/llm-env";

const key = "sk-or-test";

test("returns null when the OpenRouter key is missing", () => {
  expect(readLlmEnv({})).toBeNull();
  expect(readLlmEnv({ OPENROUTER_API_KEY: "   " })).toBeNull();
});

test("applies defaults when only the key is set", () => {
  expect(readLlmEnv({ OPENROUTER_API_KEY: key })).toEqual({
    OPENROUTER_API_KEY: key,
    OPENROUTER_APP_NAME: "portfolio",
    LLM_EXTRACT_MODEL: "deepseek/deepseek-v4.1-flash",
    LLM_PDF_ENGINE: "pdf-to-md",
    LLM_UTILITY_MODEL: "nvidia/nemotron-3.5-lightning",
    LLM_ANSWER_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
    EMBEDDING_MODEL: "nvidia/nemotron-3-embed-1b:free",
    RERANK_MODEL: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    CHAT_DAILY_MESSAGE_LIMIT: 500,
    LLM_ANSWER_REASONING: "low",
  });
});

test("trims values and keeps explicit settings", () => {
  const parsed = readLlmEnv({
    OPENROUTER_API_KEY: "  sk-or-test  ",
    OPENROUTER_APP_URL: "  https://example.com  ",
    OPENROUTER_APP_NAME: "  My Portfolio  ",
    LLM_EXTRACT_MODEL: "  custom/extract  ",
    LLM_PDF_ENGINE: "  cloudflare-ai  ",
    LLM_UTILITY_MODEL: "  custom/utility  ",
    LLM_ANSWER_MODEL: "  custom/answer  ",
    EMBEDDING_MODEL: "  custom/embed  ",
    RERANK_MODEL: "  custom/rerank  ",
    CHAT_DAILY_MESSAGE_LIMIT: "  250  ",
    LLM_ANSWER_REASONING: "  high  ",
  });

  expect(parsed).toEqual({
    OPENROUTER_API_KEY: "sk-or-test",
    OPENROUTER_APP_URL: "https://example.com",
    OPENROUTER_APP_NAME: "My Portfolio",
    LLM_EXTRACT_MODEL: "custom/extract",
    LLM_PDF_ENGINE: "cloudflare-ai",
    LLM_UTILITY_MODEL: "custom/utility",
    LLM_ANSWER_MODEL: "custom/answer",
    EMBEDDING_MODEL: "custom/embed",
    RERANK_MODEL: "custom/rerank",
    CHAT_DAILY_MESSAGE_LIMIT: 250,
    LLM_ANSWER_REASONING: "high",
  });
});

test("accepts every answer reasoning level", () => {
  for (const level of ["off", "low", "medium", "high"] as const) {
    expect(readLlmEnv({ OPENROUTER_API_KEY: key, LLM_ANSWER_REASONING: level })?.LLM_ANSWER_REASONING)
      .toBe(level);
  }
});

test("treats blank optional values as unset", () => {
  const parsed = readLlmEnv({
    OPENROUTER_API_KEY: key,
    OPENROUTER_APP_URL: "   ",
    OPENROUTER_APP_NAME: " ",
    LLM_EXTRACT_MODEL: "",
    LLM_PDF_ENGINE: "",
    LLM_UTILITY_MODEL: "",
    LLM_ANSWER_MODEL: "",
    EMBEDDING_MODEL: "",
    RERANK_MODEL: "",
    CHAT_DAILY_MESSAGE_LIMIT: " ",
    LLM_ANSWER_REASONING: "",
  });

  expect(parsed).toEqual({
    OPENROUTER_API_KEY: key,
    OPENROUTER_APP_NAME: "portfolio",
    LLM_EXTRACT_MODEL: "deepseek/deepseek-v4.1-flash",
    LLM_PDF_ENGINE: "pdf-to-md",
    LLM_UTILITY_MODEL: "nvidia/nemotron-3.5-lightning",
    LLM_ANSWER_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
    EMBEDDING_MODEL: "nvidia/nemotron-3-embed-1b:free",
    RERANK_MODEL: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
    CHAT_DAILY_MESSAGE_LIMIT: 500,
    LLM_ANSWER_REASONING: "low",
  });
});

test("returns null when a set value is invalid", () => {
  expect(
    readLlmEnv({
      OPENROUTER_API_KEY: key,
      LLM_PDF_ENGINE: "pdf-text",
    }),
  ).toBeNull();
  expect(
    readLlmEnv({
      OPENROUTER_API_KEY: key,
      CHAT_DAILY_MESSAGE_LIMIT: "0",
    }),
  ).toBeNull();
  expect(
    readLlmEnv({
      OPENROUTER_API_KEY: key,
      CHAT_DAILY_MESSAGE_LIMIT: "nope",
    }),
  ).toBeNull();
  expect(
    readLlmEnv({
      OPENROUTER_API_KEY: key,
      LLM_ANSWER_REASONING: "minimal",
    }),
  ).toBeNull();
});
