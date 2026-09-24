import "server-only";

import { readLlmEnv, type LlmEnv } from "@/server/llm/llm-env";
import { OpenRouterClient } from "@/server/llm/openrouter-client";

// One client per process. globalThis keeps it across dev hot reloads.
const globalForLlm = globalThis as unknown as {
  llmRuntime?: { client: OpenRouterClient; env: LlmEnv };
};

export class LlmConfigError extends Error {
  constructor() {
    super("OpenRouter is not configured. Set OPENROUTER_API_KEY and valid LLM settings.");
    this.name = "LlmConfigError";
  }
}

export function getLlm(): { client: OpenRouterClient; env: LlmEnv } {
  const existing = globalForLlm.llmRuntime;
  if (existing) return existing;

  const env = readLlmEnv();
  if (!env) throw new LlmConfigError();

  const runtime = {
    env,
    client: new OpenRouterClient({
      apiKey: env.OPENROUTER_API_KEY,
      appUrl: env.OPENROUTER_APP_URL,
      appName: env.OPENROUTER_APP_NAME,
    }),
  };
  globalForLlm.llmRuntime = runtime;
  return runtime;
}
