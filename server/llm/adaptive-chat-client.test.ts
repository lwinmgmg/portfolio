import { expect, test } from "bun:test";

import {
  type ChatClient,
  type ChatRequest,
  type ChatResult,
  type ChatStreamEvent,
  LlmProviderError,
} from "@/server/domain/llm";
import { AdaptiveChatClient, MANDATORY_REASONING_TOKENS } from "@/server/llm/adaptive-chat-client";

const NO_ENDPOINTS =
  "No endpoints found that can handle the requested parameters. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection";
const REASONING_MANDATORY = "Reasoning is mandatory for this endpoint and cannot be disabled.";

type Endpoint = { structuredOutputs?: boolean; reasoningOptional?: boolean; failWith?: Error };

// Refuses requests the way OpenRouter does for an endpoint with these limits.
class FakeOpenRouter implements ChatClient {
  requests: ChatRequest[] = [];
  streamed: ChatRequest[] = [];

  constructor(private readonly endpoint: Endpoint = {}) {}

  async complete(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    if (this.endpoint.failWith) throw this.endpoint.failWith;
    if (request.jsonSchema && this.endpoint.structuredOutputs === false) {
      throw new LlmProviderError(NO_ENDPOINTS, { status: 404, retryable: false });
    }
    if (request.reasoning && !("effort" in request.reasoning) && this.endpoint.reasoningOptional === false) {
      throw new LlmProviderError(REASONING_MANDATORY, { status: 400, retryable: false });
    }
    return { text: "{}", usage: null, model: request.model };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    this.streamed.push(request);
    yield { type: "done", usage: null };
  }
}

const signal = new AbortController().signal;

function utilityRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: "utility",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 300,
    temperature: 0,
    jsonSchema: { name: "out", schema: { type: "object" } },
    reasoning: { enabled: false },
    signal,
    ...overrides,
  };
}

async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

test("a request the endpoint accepts is sent once, unchanged", async () => {
  const inner = new FakeOpenRouter();
  const request = utilityRequest();

  await new AdaptiveChatClient(inner).complete(request);

  expect(inner.requests).toEqual([request]);
});

test("a 404 for the schema retries without it, and later calls skip the schema", async () => {
  const inner = new FakeOpenRouter({ structuredOutputs: false });
  const client = new AdaptiveChatClient(inner);

  await client.complete(utilityRequest());
  await client.complete(utilityRequest());

  expect(inner.requests.map((request) => request.jsonSchema !== undefined)).toEqual([
    true,
    false,
    false,
  ]);
  const retry = inner.requests[1];
  expect(retry?.signal).toBe(signal);
  expect(retry?.reasoning).toEqual({ enabled: false });
  expect(retry?.maxTokens).toBe(300);
});

test("mandatory reasoning retries at low effort with room to think, and later calls start there", async () => {
  const inner = new FakeOpenRouter({ reasoningOptional: false });
  const client = new AdaptiveChatClient(inner);

  await client.complete(utilityRequest());
  await client.complete(utilityRequest());

  expect(inner.requests.map((request) => request.reasoning)).toEqual([
    { enabled: false },
    { effort: "low" },
    { effort: "low" },
  ]);
  expect(inner.requests[1]?.maxTokens).toBe(300 + MANDATORY_REASONING_TOKENS);
  expect(inner.requests[1]?.jsonSchema).toEqual({ name: "out", schema: { type: "object" } });
});

test("both limits are learned, one retry each", async () => {
  const inner = new FakeOpenRouter({ structuredOutputs: false, reasoningOptional: false });

  await new AdaptiveChatClient(inner).complete(utilityRequest());

  expect(inner.requests.length).toBe(3);
  expect(inner.requests[2]?.jsonSchema).toBe(undefined);
  expect(inner.requests[2]?.reasoning).toEqual({ effort: "low" });
});

test("limits are learned per model", async () => {
  const inner = new FakeOpenRouter({ reasoningOptional: false });
  const client = new AdaptiveChatClient(inner);

  await client.complete(utilityRequest());
  inner.requests = [];
  await thrownBy(client.complete(utilityRequest({ model: "other" })));

  expect(inner.requests[0]?.reasoning).toEqual({ enabled: false });
});

test("concurrent calls that hit the same limit all retry", async () => {
  const inner = new FakeOpenRouter({ reasoningOptional: false });
  const client = new AdaptiveChatClient(inner);

  const results = await Promise.all([1, 2, 3].map(() => client.complete(utilityRequest())));

  expect(results.length).toBe(3);
});

test("other provider errors are not retried", async () => {
  const cases = [
    new LlmProviderError("Provider returned error", { status: 429, retryable: true }),
    new LlmProviderError("Model not found", { status: 404, retryable: false }),
    new LlmProviderError("Bad request", { status: 400, retryable: false }),
    new Error("network down"),
  ];
  for (const failure of cases) {
    const inner = new FakeOpenRouter({ failWith: failure });

    const thrown = await thrownBy(new AdaptiveChatClient(inner).complete(utilityRequest()));

    expect(thrown).toBe(failure);
    expect(inner.requests.length).toBe(1);
  }
});

test("a request that did not send the refused option is not retried", async () => {
  const inner = new FakeOpenRouter({
    failWith: new LlmProviderError(REASONING_MANDATORY, { status: 400, retryable: false }),
  });

  const thrown = await thrownBy(
    new AdaptiveChatClient(inner).complete(utilityRequest({ reasoning: { effort: "high" } })),
  );

  expect(thrown instanceof LlmProviderError).toBe(true);
  expect(inner.requests.length).toBe(1);
});

test("streams use the learned limits without retrying", async () => {
  const inner = new FakeOpenRouter({ structuredOutputs: false, reasoningOptional: false });
  const client = new AdaptiveChatClient(inner);
  await client.complete(utilityRequest());

  for await (const event of client.stream(utilityRequest())) void event;

  expect(inner.streamed[0]?.jsonSchema).toBe(undefined);
  expect(inner.streamed[0]?.reasoning).toEqual({ effort: "low" });
});
