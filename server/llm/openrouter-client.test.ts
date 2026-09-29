import { expect, test } from "bun:test";

import {
  LlmProviderError,
  type ChatRequest,
  type ChatStreamEvent,
  type DecisionRequest,
} from "@/server/domain/llm";
import {
  OpenRouterClient,
  type OpenRouterFetch,
} from "@/server/llm/openrouter-client";
import { PdfConversionError, type PdfToMarkdown } from "@/server/llm/pdf-to-markdown";

const API_KEY = "test-key";
const BASE_URL = "https://openrouter.test/api/v1";

type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

function createFetch(results: Array<() => Response | Error>): {
  fetch: OpenRouterFetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetch: OpenRouterFetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const rawBody = init?.body;
    if (typeof rawBody !== "string") throw new Error("expected a JSON request body");
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: JSON.parse(rawBody) as unknown,
    });
    const next = results[requests.length - 1];
    if (!next) throw new Error(`unexpected request ${requests.length}`);
    const result = next();
    if (result instanceof Error) throw result;
    return result;
  };
  return { fetch, requests };
}

function createClient(
  fetch: OpenRouterFetch,
  options?: {
    maxRetries?: number;
    timeoutMs?: number;
    appUrl?: string;
    appName?: string;
    pdfToMarkdown?: PdfToMarkdown;
  },
): { client: OpenRouterClient; delays: number[] } {
  const delays: number[] = [];
  const client = new OpenRouterClient({
    apiKey: API_KEY,
    appUrl: options && "appUrl" in options ? options.appUrl : "https://portfolio.example",
    appName: options && "appName" in options ? options.appName : "portfolio",
    baseUrl: BASE_URL,
    fetch,
    maxRetries: options?.maxRetries,
    timeoutMs: options?.timeoutMs,
    pdfToMarkdown: options?.pdfToMarkdown,
    sleep: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
  });
  return { client, delays };
}

function jsonResult(status: number, body: unknown): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

function textResult(status: number, body: string): () => Response {
  return () => new Response(body, { status });
}

function sseResult(chunks: string[]): () => Response {
  return () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
}

function failingStream(chunks: string[], message: string): () => Response {
  return () => {
    const encoder = new TextEncoder();
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          return;
        }
        controller.error(new Error(message));
      },
    });
    return new Response(stream, { status: 200 });
  };
}

function event(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function chatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: "requested/model",
    messages: [{ role: "user", content: "Hi" }],
    ...overrides,
  };
}

function completion(content: string) {
  return {
    model: "served/model",
    choices: [{ message: { role: "assistant", content } }],
    usage: { prompt_tokens: 11, completion_tokens: 4, cost: 0.00021 },
  };
}

function requireRequest(requests: RecordedRequest[]): RecordedRequest {
  const request = requests[0];
  if (!request) throw new Error("expected a request");
  return request;
}

async function capture(work: () => Promise<unknown>): Promise<LlmProviderError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof LlmProviderError) return error;
    throw error;
  }
  throw new Error("expected an LlmProviderError");
}

async function collectStream(
  client: OpenRouterClient,
  request: ChatRequest,
): Promise<{ events: ChatStreamEvent[]; error: LlmProviderError | null }> {
  const events: ChatStreamEvent[] = [];
  try {
    for await (const event of client.stream(request)) events.push(event);
    return { events, error: null };
  } catch (error) {
    if (error instanceof LlmProviderError) return { events, error };
    throw error;
  }
}

test("posts a chat completion and reads usage from the served model", async () => {
  const { fetch, requests } = createFetch([jsonResult(200, completion("Hello"))]);
  const { client, delays } = createClient(fetch);

  const result = await client.complete(
    chatRequest({
      messages: [
        { role: "system", content: "Be brief" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
      maxTokens: 32,
      temperature: 0,
    }),
  );

  const request = requireRequest(requests);
  expect(request.url).toBe(`${BASE_URL}/chat/completions`);
  expect(request.method).toBe("POST");
  expect(request.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
  expect(request.headers.get("content-type")).toBe("application/json");
  expect(request.headers.get("http-referer")).toBe("https://portfolio.example");
  expect(request.headers.get("x-title")).toBe("portfolio");
  expect(request.body).toEqual({
    model: "requested/model",
    messages: [
      { role: "system", content: "Be brief" },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ],
    max_tokens: 32,
    temperature: 0,
  });
  expect(result).toEqual({
    text: "Hello",
    model: "served/model",
    usage: { promptTokens: 11, completionTokens: 4, cost: 0.00021 },
  });
  expect(delays).toEqual([]);
});

test("maps content parts, json schema, and the pdf engine", async () => {
  const schema = { type: "object", properties: { name: { type: "string" } } };
  const { fetch, requests } = createFetch([jsonResult(200, completion("{}"))]);
  const { client } = createClient(fetch);

  await client.complete(
    chatRequest({
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "rules", cacheControl: true },
            { type: "text", text: "plain", cacheControl: false },
          ],
        },
        {
          role: "user",
          content: [
            { type: "file", filename: "cv.pdf", dataUrl: "data:application/pdf;base64,QQ==" },
          ],
        },
      ],
      jsonSchema: { name: "cv", schema },
      pdfEngine: "mistral-ocr",
    }),
  );

  expect(requireRequest(requests).body).toEqual({
    model: "requested/model",
    messages: [
      {
        role: "system",
        content: [
          { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
          { type: "text", text: "plain" },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "file",
            file: { filename: "cv.pdf", file_data: "data:application/pdf;base64,QQ==" },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "cv", strict: true, schema },
    },
    provider: { require_parameters: true },
    plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
  });
});

test("sends locally converted PDF Markdown as text without an OpenRouter parser", async () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 test bytes");
  const dataUrl = `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
  const converted: Uint8Array[] = [];
  const { fetch, requests } = createFetch([jsonResult(200, completion("{}"))]);
  const { client } = createClient(fetch, {
    pdfToMarkdown: async (bytes) => {
      converted.push(bytes);
      return "# Jane Doe\n\nSoftware engineer";
    },
  });

  await client.complete(chatRequest({
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Extract this CV" },
        { type: "file", filename: "cv.pdf", dataUrl },
      ],
    }],
    pdfEngine: "pdf-to-md",
  }));

  expect(converted.length).toBe(1);
  expect(Array.from(converted[0])).toEqual(Array.from(pdf));
  expect(requireRequest(requests).body).toEqual({
    model: "requested/model",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Extract this CV" },
        { type: "text", text: 'PDF "cv.pdf" converted to Markdown:\n\n# Jane Doe\n\nSoftware engineer' },
      ],
    }],
  });
});

test("does not call OpenRouter when local PDF conversion fails", async () => {
  const dataUrl = `data:application/pdf;base64,${Buffer.from("%PDF-1.4").toString("base64")}`;
  const cases: Array<{ dataUrl: string; convert: PdfToMarkdown; message: string }> = [
    {
      dataUrl: "https://example.com/cv.pdf",
      convert: async () => "# unused",
      message: "Local PDF conversion requires a PDF data URL.",
    },
    {
      dataUrl,
      convert: async () => "  ",
      message: "The PDF has no extractable text.",
    },
  ];

  for (const item of cases) {
    const { fetch, requests } = createFetch([jsonResult(200, completion("nope"))]);
    const { client } = createClient(fetch, { pdfToMarkdown: item.convert });
    let caught: unknown;
    try {
      await client.complete(
        chatRequest({
          pdfEngine: "pdf-to-md",
          messages: [{
            role: "user",
            content: [{ type: "file", filename: "cv.pdf", dataUrl: item.dataUrl }],
          }],
        }),
      );
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof PdfConversionError)) throw new Error("expected PdfConversionError");
    expect(caught.message).toBe(item.message);
    expect(requests.length).toBe(0);
  }
});

test("streams locally converted PDF Markdown", async () => {
  const dataUrl = `data:application/pdf;base64,${Buffer.from("%PDF-1.4").toString("base64")}`;
  const { fetch, requests } = createFetch([
    sseResult([event({ choices: [{ delta: { content: "ok" } }] }), "data: [DONE]\n\n"]),
  ]);
  const { client } = createClient(fetch, {
    pdfToMarkdown: async () => "# CV",
  });

  const { events, error } = await collectStream(
    client,
    chatRequest({
      pdfEngine: "pdf-to-md",
      messages: [{
        role: "user",
        content: [{ type: "file", filename: "cv.pdf", dataUrl }],
      }],
    }),
  );

  expect(error).toBeNull();
  expect(events).toEqual([
    { type: "delta", text: "ok" },
    { type: "done", usage: null },
  ]);
  expect(requireRequest(requests).body).toEqual({
    model: "requested/model",
    messages: [{
      role: "user",
      content: [{ type: "text", text: 'PDF "cv.pdf" converted to Markdown:\n\n# CV' }],
    }],
    stream: true,
  });
});

test("streams deltas and usage through split SSE chunks", async () => {
  const hello = event({ choices: [{ delta: { content: "Hello" } }] });
  const { fetch, requests } = createFetch([
    sseResult([
      ": OPENROUTER PROCESSING\n\n",
      hello.slice(0, 12),
      hello.slice(12),
      event({
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, cost: 0.01 },
      }),
      "data: [DONE]\n\n",
      event({ choices: [{ delta: { content: "hidden" } }] }),
    ]),
  ]);
  const { client } = createClient(fetch);
  const schema = { type: "object" };

  const { events, error } = await collectStream(
    client,
    chatRequest({ jsonSchema: { name: "answer", schema } }),
  );

  expect(error).toBeNull();
  expect(requireRequest(requests).body).toEqual({
    model: "requested/model",
    messages: [{ role: "user", content: "Hi" }],
    stream: true,
    response_format: {
      type: "json_schema",
      json_schema: { name: "answer", strict: true, schema },
    },
    provider: { require_parameters: true },
  });
  expect(events).toEqual([
    { type: "delta", text: "Hello" },
    {
      type: "done",
      usage: { promptTokens: 2, completionTokens: 1, cost: 0.01 },
    },
  ]);
});

test("throws a stream error and does not retry a non-retryable chunk", async () => {
  const { fetch, requests } = createFetch([
    sseResult([
      event({
        error: { message: "bad schema", code: 400 },
        choices: [{ delta: { content: "partial" }, finish_reason: "error" }],
      }),
    ]),
  ]);
  const { client, delays } = createClient(fetch);

  const { events, error } = await collectStream(client, chatRequest());

  expect(events).toEqual([]);
  expect(error?.status).toBe(400);
  expect(error?.retryable).toBe(false);
  expect(error?.message).toBe("bad schema");
  expect(requests.length).toBe(1);
  expect(delays).toEqual([]);
});

test("does not retry a stream after a delta was yielded", async () => {
  const { fetch, requests } = createFetch([
    failingStream(
      [event({ choices: [{ delta: { content: "Hi" } }] })],
      "socket hang up",
    ),
    sseResult([event({ choices: [{ delta: { content: "Again" } }] }), "data: [DONE]\n\n"]),
  ]);
  const { client, delays } = createClient(fetch);

  const { events, error } = await collectStream(client, chatRequest());

  expect(events).toEqual([{ type: "delta", text: "Hi" }]);
  expect(error?.message).toBe("socket hang up");
  expect(error?.retryable).toBe(true);
  expect(requests.length).toBe(1);
  expect(delays).toEqual([]);
});

test("retries a stream when the failure happens before any delta", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(429, { error: { message: "slow down", code: 429 } }),
    sseResult([event({ choices: [{ delta: { content: "Later" } }] }), "data: [DONE]\n\n"]),
  ]);
  const { client, delays } = createClient(fetch);

  const { events, error } = await collectStream(client, chatRequest());

  expect(error).toBeNull();
  expect(events).toEqual([
    { type: "delta", text: "Later" },
    { type: "done", usage: null },
  ]);
  expect(requests.length).toBe(2);
  expect(delays).toEqual([500]);
});

test("maps each reasoning setting to the body and omits the key when unset", async () => {
  const cases: Array<{ reasoning: ChatRequest["reasoning"]; expected: unknown }> = [
    { reasoning: { effort: "low" }, expected: { effort: "low" } },
    { reasoning: { effort: "medium" }, expected: { effort: "medium" } },
    { reasoning: { effort: "high" }, expected: { effort: "high" } },
    { reasoning: { enabled: false }, expected: { enabled: false } },
  ];

  for (const item of cases) {
    const { fetch, requests } = createFetch([jsonResult(200, completion("ok"))]);
    const { client } = createClient(fetch);
    await client.complete(chatRequest({ reasoning: item.reasoning }));
    expect(requireRequest(requests).body).toEqual({
      model: "requested/model",
      messages: [{ role: "user", content: "Hi" }],
      reasoning: item.expected,
    });
  }

  const { fetch, requests } = createFetch([jsonResult(200, completion("ok"))]);
  const { client } = createClient(fetch);
  await client.complete(chatRequest());
  expect(Object.keys(requireRequest(requests).body as object)).not.toContain("reasoning");
});

test("streams reasoning and content deltas in order and skips empty reasoning", async () => {
  const { fetch, requests } = createFetch([
    sseResult([
      event({ choices: [{ delta: { role: "assistant", content: "", reasoning: "Let me " } }] }),
      event({ choices: [{ delta: { content: null, reasoning: "check." } }] }),
      event({ choices: [{ delta: { reasoning: "" } }] }),
      event({ choices: [{ delta: { reasoning: " Done.", content: "Jane" } }] }),
      event({ choices: [{ delta: { content: " leads" } }] }),
      event({ choices: [{ delta: { reasoning: "late", content: "" } }] }),
      event({
        choices: [{ delta: { content: "" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 9 },
      }),
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events, error } = await collectStream(
    client,
    chatRequest({ reasoning: { effort: "low" } }),
  );

  expect(error).toBeNull();
  expect(requireRequest(requests).body).toEqual({
    model: "requested/model",
    messages: [{ role: "user", content: "Hi" }],
    stream: true,
    reasoning: { effort: "low" },
  });
  expect(events).toEqual([
    { type: "reasoning", text: "Let me " },
    { type: "reasoning", text: "check." },
    { type: "reasoning", text: " Done." },
    { type: "delta", text: "Jane" },
    { type: "delta", text: " leads" },
    { type: "reasoning", text: "late" },
    { type: "done", usage: { promptTokens: 5, completionTokens: 9, cost: null } },
  ]);
});

test("does not retry a stream after reasoning was yielded", async () => {
  const { fetch, requests } = createFetch([
    failingStream([event({ choices: [{ delta: { reasoning: "Hmm" } }] })], "socket hang up"),
    sseResult([event({ choices: [{ delta: { content: "Again" } }] }), "data: [DONE]\n\n"]),
  ]);
  const { client, delays } = createClient(fetch);

  const { events, error } = await collectStream(client, chatRequest());

  expect(events).toEqual([{ type: "reasoning", text: "Hmm" }]);
  expect(error?.message).toBe("socket hang up");
  expect(requests.length).toBe(1);
  expect(delays).toEqual([]);
});

test("complete returns only the content and ignores reasoning", async () => {
  const { fetch } = createFetch([
    jsonResult(200, {
      model: "served/model",
      choices: [{ message: { role: "assistant", content: "Answer", reasoning: "Thinking..." } }],
    }),
  ]);
  const { client } = createClient(fetch);

  const result = await client.complete(chatRequest({ reasoning: { effort: "low" } }));

  expect(result.text).toBe("Answer");
});

const LOOKUP_TOOL = {
  name: "lookup",
  description: "Look a word up.",
  parameters: { type: "object", properties: { word: { type: "string" } }, required: ["word"] },
};

function toolFragment(fragment: {
  index?: number;
  id?: string;
  name?: string;
  arguments?: string;
}): string {
  const call: Record<string, unknown> = { function: {} };
  if (fragment.index !== undefined) call.index = fragment.index;
  if (fragment.id !== undefined) {
    call.id = fragment.id;
    call.type = "function";
  }
  const fn: Record<string, unknown> = {};
  if (fragment.name !== undefined) fn.name = fragment.name;
  if (fragment.arguments !== undefined) fn.arguments = fragment.arguments;
  call.function = fn;
  return event({ choices: [{ delta: { tool_calls: [call] } }] });
}

const TOOL_CALLS_FINISH = event({
  choices: [{ delta: {}, finish_reason: "tool_calls" }],
  usage: { prompt_tokens: 20, completion_tokens: 8 },
});

test("maps tools, tool choice, assistant tool calls and tool results to the body", async () => {
  const { fetch, requests } = createFetch([jsonResult(200, completion("It means hello."))]);
  const { client } = createClient(fetch);

  await client.complete(
    chatRequest({
      messages: [
        { role: "user", content: "What is 'hola'?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "lookup", arguments: '{"word":"hola"}' }],
        },
        { role: "tool", toolCallId: "call_1", content: '{"meaning":"hello"}' },
        {
          role: "assistant",
          content: "Checking.",
          toolCalls: [{ id: "call_2", name: "lookup", arguments: "{}" }],
        },
        { role: "assistant", content: "Plain", toolCalls: [] },
      ],
      tools: [LOOKUP_TOOL],
      toolChoice: "none",
    }),
  );

  expect(requireRequest(requests).body).toEqual({
    model: "requested/model",
    messages: [
      { role: "user", content: "What is 'hola'?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"word":"hola"}' } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: '{"meaning":"hello"}' },
      {
        role: "assistant",
        content: "Checking.",
        tool_calls: [{ id: "call_2", type: "function", function: { name: "lookup", arguments: "{}" } }],
      },
      { role: "assistant", content: "Plain" },
    ],
    tools: [{ type: "function", function: LOOKUP_TOOL }],
    tool_choice: "none",
  });
});

test("leaves the body unchanged without tools, even with a tool choice", async () => {
  for (const tools of [undefined, []]) {
    const { fetch, requests } = createFetch([jsonResult(200, completion("ok"))]);
    const { client } = createClient(fetch);
    await client.complete(chatRequest({ tools, toolChoice: "auto" }));
    expect(requireRequest(requests).body).toEqual({
      model: "requested/model",
      messages: [{ role: "user", content: "Hi" }],
    });
  }
});

test("sends tools without tool_choice when no choice is given", async () => {
  const { fetch, requests } = createFetch([jsonResult(200, completion("ok"))]);
  const { client } = createClient(fetch);

  await client.complete(chatRequest({ tools: [LOOKUP_TOOL] }));

  const body = requireRequest(requests).body as Record<string, unknown>;
  expect(body.tools).toEqual([{ type: "function", function: LOOKUP_TOOL }]);
  expect(Object.keys(body)).not.toContain("tool_choice");
});

test("assembles a tool call from fragments split across SSE chunks", async () => {
  const middle = toolFragment({ index: 0, arguments: '"word":"ho' });
  const { fetch } = createFetch([
    sseResult([
      toolFragment({ index: 0, id: "call_1", name: "lookup", arguments: "" }),
      toolFragment({ index: 0, arguments: "{" }),
      middle.slice(0, 20),
      middle.slice(20),
      toolFragment({ index: 0, arguments: 'la"}' }),
      TOOL_CALLS_FINISH,
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events, error } = await collectStream(
    client,
    chatRequest({ tools: [LOOKUP_TOOL], toolChoice: "auto" }),
  );

  expect(error).toBeNull();
  expect(events).toEqual([
    { type: "tool_call", call: { id: "call_1", name: "lookup", arguments: '{"word":"hola"}' } },
    { type: "done", usage: { promptTokens: 20, completionTokens: 8, cost: null } },
  ]);
});

test("emits parallel calls in index order", async () => {
  const { fetch } = createFetch([
    sseResult([
      toolFragment({ index: 1, id: "call_b", name: "lookup", arguments: '{"word":' }),
      toolFragment({ index: 0, id: "call_a", name: "lookup", arguments: '{"word":"a"}' }),
      toolFragment({ index: 1, arguments: '"b"}' }),
      TOOL_CALLS_FINISH,
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events } = await collectStream(client, chatRequest({ tools: [LOOKUP_TOOL] }));

  expect(events.filter((item) => item.type === "tool_call")).toEqual([
    { type: "tool_call", call: { id: "call_a", name: "lookup", arguments: '{"word":"a"}' } },
    { type: "tool_call", call: { id: "call_b", name: "lookup", arguments: '{"word":"b"}' } },
  ]);
});

test("streams content before the tool call it precedes", async () => {
  const { fetch } = createFetch([
    sseResult([
      event({ choices: [{ delta: { content: "Let me " } }] }),
      event({ choices: [{ delta: { content: "check." } }] }),
      toolFragment({ index: 0, id: "call_1", name: "lookup", arguments: '{"word":"hola"}' }),
      TOOL_CALLS_FINISH,
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events } = await collectStream(client, chatRequest({ tools: [LOOKUP_TOOL] }));

  expect(events.map((item) => item.type)).toEqual(["delta", "delta", "tool_call", "done"]);
});

test("streams reasoning interleaved with tool-call fragments", async () => {
  const { fetch } = createFetch([
    sseResult([
      event({ choices: [{ delta: { reasoning: "Need a lookup." } }] }),
      event({
        choices: [
          {
            delta: {
              reasoning: " Calling it.",
              tool_calls: [
                { index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{" } },
              ],
            },
          },
        ],
      }),
      event({ choices: [{ delta: { reasoning: " Almost." } }] }),
      toolFragment({ index: 0, arguments: '"word":"hola"}' }),
      TOOL_CALLS_FINISH,
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events } = await collectStream(
    client,
    chatRequest({ tools: [LOOKUP_TOOL], reasoning: { effort: "low" } }),
  );

  expect(events).toEqual([
    { type: "reasoning", text: "Need a lookup." },
    { type: "reasoning", text: " Calling it." },
    { type: "reasoning", text: " Almost." },
    { type: "tool_call", call: { id: "call_1", name: "lookup", arguments: '{"word":"hola"}' } },
    { type: "done", usage: { promptTokens: 20, completionTokens: 8, cost: null } },
  ]);
});

test("emits a call with no id, no name and unparseable arguments as it came", async () => {
  const { fetch } = createFetch([
    sseResult([toolFragment({ index: 0, arguments: '{"word": ' }), "data: [DONE]\n\n"]),
  ]);
  const { client } = createClient(fetch);

  const { events } = await collectStream(client, chatRequest({ tools: [LOOKUP_TOOL] }));

  expect(events).toEqual([
    { type: "tool_call", call: { id: "", name: "", arguments: '{"word": ' } },
    { type: "done", usage: null },
  ]);
});

test("keeps the first id and name when a provider repeats them", async () => {
  const { fetch } = createFetch([
    sseResult([
      toolFragment({ index: 0, id: "call_1", name: "lookup", arguments: '{"word":' }),
      toolFragment({ index: 0, id: "call_1", name: "lookup", arguments: '"hola"}' }),
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events } = await collectStream(client, chatRequest({ tools: [LOOKUP_TOOL] }));

  expect(events[0]).toEqual({
    type: "tool_call",
    call: { id: "call_1", name: "lookup", arguments: '{"word":"hola"}' },
  });
});

test("joins fragments without an index to the last call unless a new id starts one", async () => {
  const { fetch } = createFetch([
    sseResult([
      toolFragment({ id: "call_a", name: "lookup", arguments: '{"word":' }),
      toolFragment({ arguments: '"a"}' }),
      toolFragment({ id: "call_b", name: "lookup", arguments: '{"word":"b"}' }),
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client } = createClient(fetch);

  const { events } = await collectStream(client, chatRequest({ tools: [LOOKUP_TOOL] }));

  expect(events.filter((item) => item.type === "tool_call")).toEqual([
    { type: "tool_call", call: { id: "call_a", name: "lookup", arguments: '{"word":"a"}' } },
    { type: "tool_call", call: { id: "call_b", name: "lookup", arguments: '{"word":"b"}' } },
  ]);
});

test("retries a stream that fails after tool fragments but before any event", async () => {
  const { fetch, requests } = createFetch([
    failingStream(
      [toolFragment({ index: 0, id: "call_1", name: "lookup", arguments: '{"wo' })],
      "socket hang up",
    ),
    sseResult([
      toolFragment({ index: 0, id: "call_2", name: "lookup", arguments: '{"word":"hola"}' }),
      "data: [DONE]\n\n",
    ]),
  ]);
  const { client, delays } = createClient(fetch);

  const { events, error } = await collectStream(client, chatRequest({ tools: [LOOKUP_TOOL] }));

  expect(error).toBeNull();
  expect(events).toEqual([
    { type: "tool_call", call: { id: "call_2", name: "lookup", arguments: '{"word":"hola"}' } },
    { type: "done", usage: null },
  ]);
  expect(requests.length).toBe(2);
  expect(delays).toEqual([500]);
});

test("complete returns tool calls with null content and no toolCalls key otherwise", async () => {
  const { fetch } = createFetch([
    jsonResult(200, {
      model: "served/model",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "lookup", arguments: '{"word":"hola"}' } },
              { id: "call_2", type: "function", function: { name: "lookup", arguments: { word: "adios" } } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    }),
    jsonResult(200, completion("Hello")),
    jsonResult(200, { choices: [{ message: { role: "assistant", content: null } }] }),
  ]);
  const { client } = createClient(fetch);

  const called = await client.complete(chatRequest({ tools: [LOOKUP_TOOL] }));
  expect(called).toEqual({
    text: "",
    usage: null,
    model: "served/model",
    toolCalls: [
      { id: "call_1", name: "lookup", arguments: '{"word":"hola"}' },
      { id: "call_2", name: "lookup", arguments: '{"word":"adios"}' },
    ],
  });

  const plain = await client.complete(chatRequest());
  expect(Object.keys(plain)).not.toContain("toolCalls");

  const empty = await capture(() => client.complete(chatRequest()));
  expect(empty.message).toBe("OpenRouter chat response is missing text");
});

test("orders embedding vectors by index", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(200, {
      data: [
        { index: 1, embedding: [0.2] },
        { index: 0, embedding: [0.1, 0.3] },
      ],
      usage: { prompt_tokens: 4, total_tokens: 4 },
    }),
  ]);
  const { client } = createClient(fetch);

  const result = await client.embed({
    model: "embed/model",
    texts: ["alpha", "beta"],
  });

  expect(requireRequest(requests).url).toBe(`${BASE_URL}/embeddings`);
  expect(requireRequest(requests).body).toEqual({
    model: "embed/model",
    input: ["alpha", "beta"],
  });
  expect(result).toEqual({
    vectors: [
      [0.1, 0.3],
      [0.2],
    ],
    usage: { promptTokens: 4, completionTokens: 0, cost: null },
  });
});

test("sends a rerank request and sorts scores descending", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(200, {
      results: [
        { index: 2, relevance_score: 0.2 },
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.9 },
      ],
    }),
  ]);
  const { client } = createClient(fetch);

  const results = await client.rerank({
    model: "rerank/model",
    query: "capital",
    documents: ["Paris", "Lyon", "Berlin"],
    topN: 2,
  });

  expect(requireRequest(requests).url).toBe(`${BASE_URL}/rerank`);
  expect(requireRequest(requests).body).toEqual({
    model: "rerank/model",
    query: "capital",
    documents: ["Paris", "Lyon", "Berlin"],
    top_n: 2,
  });
  expect(results).toEqual([
    { index: 0, score: 0.9 },
    { index: 1, score: 0.9 },
    { index: 2, score: 0.2 },
  ]);
});

test("does not retry a 400", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(400, { error: { message: "unknown model", code: 400 } }),
    jsonResult(200, completion("nope")),
  ]);
  const { client, delays } = createClient(fetch);

  const error = await capture(() => client.complete(chatRequest()));

  expect(error.status).toBe(400);
  expect(error.retryable).toBe(false);
  expect(error.message).toBe("unknown model");
  expect(requests.length).toBe(1);
  expect(delays).toEqual([]);
});

test("retries a 429 with a 500 ms then 1500 ms backoff", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(429, { error: { message: "once", code: 429 } }),
    jsonResult(429, { error: { message: "twice", code: 429 } }),
    jsonResult(200, completion("ok")),
  ]);
  const { client, delays } = createClient(fetch);

  const result = await client.complete(chatRequest());

  expect(result.text).toBe("ok");
  expect(requests.length).toBe(3);
  expect(delays).toEqual([500, 1500]);
});

test("stops after the retry budget is spent on 429", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(429, { error: { message: "once", code: 429 } }),
    jsonResult(429, { error: { message: "twice", code: 429 } }),
    jsonResult(429, { error: { message: "thrice", code: 429 } }),
  ]);
  const { client, delays } = createClient(fetch);

  const error = await capture(() => client.embed({ model: "embed/model", texts: ["a"] }));

  expect(error.message).toBe("thrice");
  expect(error.status).toBe(429);
  expect(error.retryable).toBe(true);
  expect(requests.length).toBe(3);
  expect(delays).toEqual([500, 1500]);
});

test("retries a 500 response", async () => {
  const { fetch, requests } = createFetch([
    textResult(500, "upstream blew up"),
    jsonResult(200, completion("recovered")),
  ]);
  const { client, delays } = createClient(fetch, { maxRetries: 1 });

  const result = await client.complete(chatRequest());

  expect(result.text).toBe("recovered");
  expect(requests.length).toBe(2);
  expect(delays).toEqual([500]);
});

test("retries a network error", async () => {
  const { fetch, requests } = createFetch([
    () => new TypeError("socket hang up"),
    jsonResult(200, completion("back")),
  ]);
  const { client, delays } = createClient(fetch, { maxRetries: 1 });

  const result = await client.complete(chatRequest());

  expect(result.text).toBe("back");
  expect(requests.length).toBe(2);
  expect(delays).toEqual([500]);
});

test("does not retry an aborted request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetch: OpenRouterFetch = async (_input, init) => {
    calls += 1;
    controller.abort();
    if (!init?.signal) throw new Error("missing signal");
    throw new DOMException("The operation was aborted", "AbortError");
  };
  const { client, delays } = createClient(fetch);

  const error = await capture(() =>
    client.complete(chatRequest({ signal: controller.signal })),
  );

  expect(error.message).toBe("OpenRouter request was aborted");
  expect(error.retryable).toBe(false);
  expect(error.status).toBeNull();
  expect(calls).toBe(1);
  expect(delays).toEqual([]);
});

test("does not retry an aborted rerank request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetch: OpenRouterFetch = async (_input, init) => {
    calls += 1;
    controller.abort();
    if (!init?.signal) throw new Error("missing signal");
    throw new DOMException("The operation was aborted", "AbortError");
  };
  const { client, delays } = createClient(fetch);

  const error = await capture(() =>
    client.rerank({
      model: "rerank/model",
      query: "capital",
      documents: ["Paris"],
      topN: 1,
      signal: controller.signal,
    }),
  );

  expect(error.message).toBe("OpenRouter request was aborted");
  expect(calls).toBe(1);
  expect(delays).toEqual([]);
});

test("retries a timed out request", async () => {
  let calls = 0;
  const fetch: OpenRouterFetch = (_input, init) => {
    calls += 1;
    if (calls > 1) return Promise.resolve(jsonResult(200, completion("late"))());
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      const onAbort = () => {
        const reason = signal.reason;
        reject(reason instanceof Error ? reason : new DOMException("timed out", "TimeoutError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  };
  const { client, delays } = createClient(fetch, { maxRetries: 1, timeoutMs: 20 });

  const result = await client.complete(chatRequest());

  expect(result.text).toBe("late");
  expect(calls).toBe(2);
  expect(delays).toEqual([500]);
});

test("omits attribution headers when the app url and name are blank", async () => {
  const { fetch, requests } = createFetch([jsonResult(200, completion("Hi"))]);
  const { client } = createClient(fetch, { appUrl: "  ", appName: "" });

  await client.complete(chatRequest());

  const headers = requireRequest(requests).headers;
  expect(headers.get("http-referer")).toBeNull();
  expect(headers.get("x-title")).toBeNull();
  expect(headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
});

test("does not retry an invalid completion payload", async () => {
  const { fetch, requests } = createFetch([jsonResult(200, { choices: [] })]);
  const { client, delays } = createClient(fetch);

  const error = await capture(() => client.complete(chatRequest()));

  expect(error.message).toBe("OpenRouter chat response is missing a message");
  expect(error.retryable).toBe(false);
  expect(requests.length).toBe(1);
  expect(delays).toEqual([]);
});

function decisionRequest(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    model: "router/model",
    state: { subject: "Ada", history: [], message: "hi" },
    questions: {
      scope: {
        type: "choice",
        instructions: "Classify the message.",
        criteria: { cv: "About the CV.", smalltalk: "A greeting." },
      },
    },
    ...overrides,
  };
}

function decision() {
  return {
    id: "gen-dec-1",
    model: "router/model-20260926",
    provider: "Respan",
    answers: {
      scope: {
        type: "choice",
        choice: "smalltalk",
        confidence: 0.8,
        probabilities: { cv: 0.1, smalltalk: 0.9 },
      },
    },
    usage: { input_tokens: 120, output_tokens: 3, cost: 0.00001 },
  };
}

test("posts a decision beside /api/v1 and reads the answer, model and usage", async () => {
  const { fetch, requests } = createFetch([jsonResult(200, decision())]);
  const { client } = createClient(fetch);

  const result = await client.decide(decisionRequest());

  const request = requireRequest(requests);
  expect(request.url).toBe("https://openrouter.test/api/alpha/decisions");
  expect(request.method).toBe("POST");
  expect(request.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
  expect(request.headers.get("x-title")).toBe("portfolio");
  expect(request.body).toEqual({
    model: "router/model",
    state: { subject: "Ada", history: [], message: "hi" },
    questions: {
      scope: {
        type: "choice",
        instructions: "Classify the message.",
        criteria: { cv: "About the CV.", smalltalk: "A greeting." },
      },
    },
  });
  expect(result).toEqual({
    answers: {
      scope: { choice: "smalltalk", confidence: 0.8, probabilities: { cv: 0.1, smalltalk: 0.9 } },
    },
    model: "router/model-20260926",
    usage: { promptTokens: 120, completionTokens: 3, cost: 0.00001 },
  });
});

test("falls back to the requested model and null usage when they are missing", async () => {
  const { answers } = decision();
  const { fetch } = createFetch([jsonResult(200, { answers })]);
  const { client } = createClient(fetch);

  const result = await client.decide(decisionRequest());

  expect(result.model).toBe("router/model");
  expect(result.usage).toBeNull();
});

test("does not retry a 429 decision", async () => {
  const { fetch, requests } = createFetch([
    jsonResult(429, { error: { message: "rate limited", code: 429 } }),
    jsonResult(200, decision()),
  ]);
  const { client, delays } = createClient(fetch);

  const error = await capture(() => client.decide(decisionRequest()));

  expect(error.status).toBe(429);
  expect(error.message).toBe("rate limited");
  expect(requests.length).toBe(1);
  expect(delays).toEqual([]);
});

test("maps an error inside a 200 decision body", async () => {
  const { fetch } = createFetch([
    jsonResult(200, { error: { message: "question type not supported", code: 400 } }),
  ]);
  const { client } = createClient(fetch);

  const error = await capture(() => client.decide(decisionRequest()));

  expect(error.status).toBe(400);
  expect(error.message).toBe("question type not supported");
});

test("rejects a malformed decision body", async () => {
  const { fetch } = createFetch([
    jsonResult(200, { answers: { scope: { choice: "smalltalk", confidence: 0.8 } } }),
  ]);
  const { client } = createClient(fetch);

  const error = await capture(() => client.decide(decisionRequest()));

  expect(error.message).toBe("OpenRouter decision response is invalid");
  expect(error.retryable).toBe(false);
});

test("maps a decision timeout without retrying", async () => {
  let calls = 0;
  const fetch: OpenRouterFetch = (_input, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("timed out", "TimeoutError")),
        { once: true },
      );
    });
  };
  const { client, delays } = createClient(fetch, { timeoutMs: 20 });

  const error = await capture(() => client.decide(decisionRequest()));

  expect(error.message).toBe("OpenRouter request timed out");
  expect(error.status).toBe(408);
  expect(calls).toBe(1);
  expect(delays).toEqual([]);
});
