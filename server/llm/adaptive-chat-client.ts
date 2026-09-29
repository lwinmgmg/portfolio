import {
  type ChatClient,
  type ChatRequest,
  type ChatResult,
  type ChatStreamEvent,
  LlmProviderError,
} from "@/server/domain/llm";

// Thinking budget added when a model cannot turn reasoning off, so it does not eat the answer.
export const MANDATORY_REASONING_TOKENS = 1_024;

const NO_ENDPOINTS = /no endpoints found/i;
const REASONING_MANDATORY = /reasoning is mandatory/i;

type EndpointLimits = { structuredOutputs: boolean; reasoningOptional: boolean };

// Learns, per model, which request options OpenRouter refuses, then stops sending them:
// - a strict JSON schema no endpoint supports (404 "No endpoints found"): sent without it, so the
//   caller's prompt and parser must also accept plain JSON;
// - `reasoning: { enabled: false }` on a model that always reasons (400): sent with low effort
//   and MANDATORY_REASONING_TOKENS more room.
// Each refusal is a fast failed call, once per model per process. The retry keeps the caller's
// signal, so it spends the same time budget. Streams use what was learned but do not retry.
export class AdaptiveChatClient implements ChatClient {
  private readonly limits = new Map<string, EndpointLimits>();

  constructor(private readonly inner: ChatClient) {}

  async complete(request: ChatRequest): Promise<ChatResult> {
    // Each retry drops an option the last attempt sent, so this ends after at most three calls.
    for (;;) {
      const sent = this.adapt(request);
      try {
        return await this.inner.complete(sent);
      } catch (error) {
        if (!this.learn(sent, error)) throw error;
      }
    }
  }

  stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    return this.inner.stream(this.adapt(request));
  }

  private adapt(request: ChatRequest): ChatRequest {
    const limits = this.limitsFor(request.model);
    let adapted = request;
    if (adapted.jsonSchema && !limits.structuredOutputs) {
      adapted = { ...adapted, jsonSchema: undefined };
    }
    if (isReasoningOff(adapted) && !limits.reasoningOptional) {
      adapted = {
        ...adapted,
        reasoning: { effort: "low" },
        maxTokens:
          adapted.maxTokens === undefined
            ? undefined
            : adapted.maxTokens + MANDATORY_REASONING_TOKENS,
      };
    }
    return adapted;
  }

  // Concurrent calls may learn the same limit; checking what was sent keeps each one retrying.
  private learn(sent: ChatRequest, error: unknown): boolean {
    if (!(error instanceof LlmProviderError)) return false;
    const limits = this.limitsFor(sent.model);
    if (sent.jsonSchema && error.status === 404 && NO_ENDPOINTS.test(error.message)) {
      limits.structuredOutputs = false;
      return true;
    }
    if (isReasoningOff(sent) && error.status === 400 && REASONING_MANDATORY.test(error.message)) {
      limits.reasoningOptional = false;
      return true;
    }
    return false;
  }

  private limitsFor(model: string): EndpointLimits {
    let limits = this.limits.get(model);
    if (!limits) {
      limits = { structuredOutputs: true, reasoningOptional: true };
      this.limits.set(model, limits);
    }
    return limits;
  }
}

function isReasoningOff(request: ChatRequest): boolean {
  return request.reasoning !== undefined && !("effort" in request.reasoning);
}
