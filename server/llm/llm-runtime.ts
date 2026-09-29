import "server-only";

import { readLlmEnv, type LlmEnv } from "@/server/llm/llm-env";
import { OpenRouterClient } from "@/server/llm/openrouter-client";

// One client per module graph, deliberately not on globalThis. The client holds no connections,
// and a shared one throws LlmProviderError from another graph's (or a pre-reload) copy of the
// class, so `instanceof` checks such as AdaptiveChatClient's quietly fail and nothing adapts.
let llmRuntime: { client: OpenRouterClient; env: LlmEnv } | null = null;

export class LlmConfigError extends Error {
  constructor() {
    super("OpenRouter is not configured. Set OPENROUTER_API_KEY and valid LLM settings.");
    this.name = "LlmConfigError";
  }
}

export function getLlm(): { client: OpenRouterClient; env: LlmEnv } {
  if (llmRuntime) return llmRuntime;

  const env = readLlmEnv();
  if (!env) throw new LlmConfigError();

  llmRuntime = {
    env,
    client: new OpenRouterClient({
      apiKey: env.OPENROUTER_API_KEY,
      appUrl: env.OPENROUTER_APP_URL,
      appName: env.OPENROUTER_APP_NAME,
    }),
  };
  return llmRuntime;
}
