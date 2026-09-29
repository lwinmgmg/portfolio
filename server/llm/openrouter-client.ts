import {
  LlmProviderError,
  type ChatClient,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ChatStreamEvent,
  type ContentPart,
  type EmbeddingClient,
  type PdfEngine,
  type RerankClient,
  type RerankResult,
  type Usage,
} from "@/server/domain/llm";
import { parseSse } from "@/server/llm/sse";
import { preparePdfChatRequest } from "@/server/llm/pdf-chat-request";
import { convertPdfToMarkdown, type PdfToMarkdown } from "@/server/llm/pdf-to-markdown";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

export type OpenRouterFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type OpenRouterClientOptions = {
  apiKey: string;
  appUrl?: string;
  appName?: string;
  fetch?: OpenRouterFetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  pdfToMarkdown?: PdfToMarkdown;
};

type WireTextPart = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

type WireFilePart = {
  type: "file";
  file: {
    filename: string;
    file_data: string;
  };
};

type WireMessage = {
  role: ChatMessage["role"];
  content: string | Array<WireTextPart | WireFilePart>;
};

type ChatBody = {
  model: string;
  messages: WireMessage[];
  stream?: true;
  max_tokens?: number;
  temperature?: number;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: true;
      schema: Record<string, unknown>;
    };
  };
  provider?: { require_parameters: true };
  plugins?: Array<{
    id: "file-parser";
    pdf: { engine: Exclude<PdfEngine, "pdf-to-md"> };
  }>;
};

type OpenRouterPath = "/chat/completions" | "/embeddings" | "/rerank";

export class OpenRouterClient implements ChatClient, EmbeddingClient, RerankClient {
  private readonly apiKey: string;
  private readonly appUrl: string | undefined;
  private readonly appName: string | undefined;
  private readonly fetchImpl: OpenRouterFetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pdfToMarkdown: PdfToMarkdown;

  constructor(options: OpenRouterClientOptions) {
    this.apiKey = options.apiKey;
    this.appUrl = blankToUndefined(options.appUrl);
    this.appName = blankToUndefined(options.appName);
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.sleep = options.sleep ?? defaultSleep;
    this.pdfToMarkdown = options.pdfToMarkdown ?? convertPdfToMarkdown;
  }

  async complete(request: ChatRequest): Promise<ChatResult> {
    const prepared = await preparePdfChatRequest(request, this.pdfToMarkdown);
    const payload = await this.execute(prepared.signal, async (signal) => {
      const response = await this.fetchOnce(
        "/chat/completions",
        chatBody(prepared, false),
        signal,
      );
      return readJson(response);
    });
    return parseChatResult(payload, prepared.model);
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const prepared = await preparePdfChatRequest(request, this.pdfToMarkdown);
    let yielded = false;
    let lastError: LlmProviderError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      throwIfAborted(prepared.signal);
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const signal = combineSignals(prepared.signal, timeoutSignal);
      try {
        yield* this.readStream(prepared, signal, () => {
          yielded = true;
        });
        return;
      } catch (error) {
        lastError = mapTransportError(error, prepared.signal, timeoutSignal);
        // A yielded event is already visible to the caller, so it cannot be retried.
        if (yielded || !lastError.retryable || attempt === this.maxRetries) throw lastError;
        await this.sleep(backoffMs(attempt));
      }
    }

    throw lastError ?? failed("OpenRouter request failed");
  }

  async embed(input: {
    model: string;
    texts: string[];
  }): Promise<{ vectors: number[][]; usage: Usage | null }> {
    const payload = await this.execute(undefined, async (signal) => {
      const response = await this.fetchOnce(
        "/embeddings",
        { model: input.model, input: input.texts },
        signal,
      );
      return readJson(response);
    });
    return parseEmbeddings(payload, input.texts.length);
  }

  async rerank(input: {
    model: string;
    query: string;
    documents: string[];
    topN: number;
    signal?: AbortSignal;
  }): Promise<RerankResult[]> {
    const payload = await this.execute(input.signal, async (signal) => {
      const response = await this.fetchOnce(
        "/rerank",
        {
          model: input.model,
          query: input.query,
          documents: input.documents,
          top_n: input.topN,
        },
        signal,
      );
      return readJson(response);
    });
    return parseRerank(payload);
  }

  private async execute<T>(
    outerSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    let lastError: LlmProviderError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      throwIfAborted(outerSignal);
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const signal = combineSignals(outerSignal, timeoutSignal);
      try {
        return await operation(signal);
      } catch (error) {
        lastError = mapTransportError(error, outerSignal, timeoutSignal);
        if (!lastError.retryable || attempt === this.maxRetries) throw lastError;
        await this.sleep(backoffMs(attempt));
      }
    }

    throw lastError ?? failed("OpenRouter request failed");
  }

  private async *readStream(
    request: ChatRequest,
    signal: AbortSignal,
    onYield: () => void,
  ): AsyncIterable<ChatStreamEvent> {
    const response = await this.fetchOnce("/chat/completions", chatBody(request, true), signal);
    const body = response.body;
    if (!body) {
      throw new LlmProviderError("OpenRouter returned an empty stream", {
        status: response.status,
        retryable: true,
      });
    }

    let usage: Usage | null = null;
    for await (const data of parseSse(body)) {
      const chunk = interpretChunk(data);
      if (chunk.error) throw chunk.error;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.delta === null) continue;
      onYield();
      yield { type: "delta", text: chunk.delta };
    }

    onYield();
    yield { type: "done", usage };
  }

  private async fetchOnce(path: OpenRouterPath, body: unknown, signal: AbortSignal): Promise<Response> {
    const response = await this.fetchImpl(this.endpoint(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  }

  private endpoint(path: OpenRouterPath): string {
    return `${this.baseUrl}${path}`;
  }

  private headers(): Headers {
    const headers = new Headers({
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    });
    if (this.appUrl) headers.set("HTTP-Referer", this.appUrl);
    if (this.appName) headers.set("X-Title", this.appName);
    return headers;
  }
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function backoffMs(attempt: number): number {
  return 500 * 3 ** attempt;
}

function combineSignals(outer: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!outer) return timeout;
  return AbortSignal.any([outer, timeout]);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new LlmProviderError("OpenRouter request was aborted", {
    status: null,
    retryable: false,
  });
}

function chatBody(request: ChatRequest, stream: boolean): ChatBody {
  const body: ChatBody = {
    model: request.model,
    messages: request.messages.map(mapMessage),
  };
  if (stream) body.stream = true;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: request.jsonSchema.name,
        strict: true,
        schema: request.jsonSchema.schema,
      },
    };
    body.provider = { require_parameters: true };
  }
  if (request.pdfEngine && request.pdfEngine !== "pdf-to-md") {
    body.plugins = [{ id: "file-parser", pdf: { engine: request.pdfEngine } }];
  }
  return body;
}

function mapMessage(message: ChatMessage): WireMessage {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  return { role: message.role, content: message.content.map(mapPart) };
}

function mapPart(part: ContentPart): WireTextPart | WireFilePart {
  if (part.type === "file") {
    return {
      type: "file",
      file: { filename: part.filename, file_data: part.dataUrl },
    };
  }
  if (part.cacheControl) {
    return {
      type: "text",
      text: part.text,
      cache_control: { type: "ephemeral" },
    };
  }
  return { type: "text", text: part.text };
}

function parseChatResult(payload: unknown, fallbackModel: string): ChatResult {
  const record = objectPayload(payload, "OpenRouter chat response was not an object");
  const failure = readFailure(record);
  if (failure) throw failure;

  const choice = firstChoice(record);
  if (!choice || !isRecord(choice.message)) {
    throw failed("OpenRouter chat response is missing a message");
  }
  if (typeof choice.message.content !== "string") {
    throw failed("OpenRouter chat response is missing text");
  }

  return {
    text: choice.message.content,
    usage: readUsage(record),
    model: typeof record.model === "string" && record.model.length > 0 ? record.model : fallbackModel,
  };
}

function parseEmbeddings(
  payload: unknown,
  count: number,
): { vectors: number[][]; usage: Usage | null } {
  const record = objectPayload(payload, "OpenRouter embeddings response was not an object");
  const failure = readFailure(record);
  if (failure) throw failure;
  if (!Array.isArray(record.data)) throw failed("OpenRouter embeddings response is missing data");

  const slots: Array<number[] | undefined> = Array.from({ length: count }, () => undefined);
  for (const item of record.data) {
    if (!isRecord(item)) throw failed("OpenRouter embeddings item is invalid");
    const index = integerValue(item.index);
    if (index === null) throw failed("OpenRouter embeddings item is invalid");
    if (index < 0 || index >= count || slots[index]) {
      throw failed("OpenRouter embeddings indexes are invalid");
    }
    slots[index] = readVector(item.embedding);
  }

  const vectors: number[][] = [];
  for (const slot of slots) {
    if (!slot) throw failed("OpenRouter embeddings response is missing a vector");
    vectors.push(slot);
  }
  return { vectors, usage: readUsage(record) };
}

function readVector(value: unknown): number[] {
  if (!Array.isArray(value)) throw failed("OpenRouter embeddings item is missing a vector");
  const vector: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw failed("OpenRouter embedding values must be numbers");
    }
    vector.push(entry);
  }
  return vector;
}

function parseRerank(payload: unknown): RerankResult[] {
  const record = objectPayload(payload, "OpenRouter rerank response was not an object");
  const failure = readFailure(record);
  if (failure) throw failure;
  if (!Array.isArray(record.results)) throw failed("OpenRouter rerank response is missing results");

  const results: RerankResult[] = [];
  for (const item of record.results) {
    if (!isRecord(item)) throw failed("OpenRouter rerank result is invalid");
    const index = integerValue(item.index);
    if (index === null) throw failed("OpenRouter rerank result is invalid");
    if (typeof item.relevance_score !== "number" || !Number.isFinite(item.relevance_score)) {
      throw failed("OpenRouter rerank result is missing a score");
    }
    results.push({ index, score: item.relevance_score });
  }

  results.sort((left, right) => right.score - left.score);
  return results;
}

type StreamChunk = {
  delta: string | null;
  usage: Usage | null;
  error: LlmProviderError | null;
};

function interpretChunk(data: string): StreamChunk {
  let payload: unknown;
  try {
    payload = JSON.parse(data) as unknown;
  } catch (cause) {
    throw new LlmProviderError("OpenRouter stream returned invalid JSON", {
      status: null,
      retryable: false,
      cause,
    });
  }

  const record = objectPayload(payload, "OpenRouter stream chunk was not an object");
  return {
    delta: readDelta(record),
    usage: readUsage(record),
    error: readStreamError(record),
  };
}

function readDelta(payload: Record<string, unknown>): string | null {
  const choice = firstChoice(payload);
  if (!choice || !isRecord(choice.delta) || typeof choice.delta.content !== "string") return null;
  return choice.delta.content.length === 0 ? null : choice.delta.content;
}

function readStreamError(payload: Record<string, unknown>): LlmProviderError | null {
  if ("error" in payload && payload.error != null) return failureFromValue(payload.error);
  const choice = firstChoice(payload);
  if (!choice) return null;
  if (choice.error != null) return failureFromValue(choice.error);
  if (choice.finish_reason === "error") {
    return failed("OpenRouter stream failed");
  }
  return null;
}

function firstChoice(payload: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(payload.choices) || !isRecord(payload.choices[0])) return null;
  return payload.choices[0];
}

function readUsage(payload: Record<string, unknown>): Usage | null {
  if (!isRecord(payload.usage) || typeof payload.usage.prompt_tokens !== "number") return null;
  if (!Number.isFinite(payload.usage.prompt_tokens)) return null;
  const completion = payload.usage.completion_tokens;
  const completionTokens =
    typeof completion === "number" && Number.isFinite(completion) ? completion : 0;
  const cost = payload.usage.cost;
  return {
    promptTokens: payload.usage.prompt_tokens,
    completionTokens,
    cost: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
  };
}

function readFailure(payload: Record<string, unknown>): LlmProviderError | null {
  if (!("error" in payload) || payload.error == null) return null;
  return failureFromValue(payload.error);
}

function failureFromValue(error: unknown): LlmProviderError {
  if (typeof error === "string" && error.trim().length > 0) return failed(error);
  if (!isRecord(error)) return failed("OpenRouter request failed");

  const message =
    typeof error.message === "string" && error.message.trim().length > 0
      ? error.message
      : "OpenRouter request failed";
  const status = numericStatus(error.code) ?? numericStatus(error.status);
  return new LlmProviderError(message, {
    status,
    retryable: status !== null && isRetryableStatus(status),
  });
}

async function errorFromResponse(response: Response): Promise<LlmProviderError> {
  const status = response.status;
  let message = `OpenRouter request failed with status ${status}`;
  try {
    const text = await response.text();
    if (text.trim().length > 0) {
      const extracted = messageFromPayload(JSON.parse(text) as unknown);
      if (extracted) message = extracted;
    }
  } catch {
    // Non-JSON bodies still map from the HTTP status.
  }
  return new LlmProviderError(message, {
    status,
    retryable: isRetryableStatus(status),
  });
}

function messageFromPayload(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim().length > 0) return payload;
  if (!isRecord(payload)) return null;
  if (payload.error != null) {
    if (typeof payload.error === "string" && payload.error.trim().length > 0) return payload.error;
    if (isRecord(payload.error) && typeof payload.error.message === "string") {
      const message = payload.error.message.trim();
      if (message.length > 0) return payload.error.message;
    }
  }
  if (typeof payload.message === "string" && payload.message.trim().length > 0) return payload.message;
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    throw new LlmProviderError("OpenRouter returned an empty response", {
      status: response.status,
      retryable: false,
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new LlmProviderError("OpenRouter returned invalid JSON", {
      status: response.status,
      retryable: false,
      cause,
    });
  }
}

function objectPayload(payload: unknown, message: string): Record<string, unknown> {
  if (!isRecord(payload)) throw failed(message);
  return payload;
}

function failed(message: string): LlmProviderError {
  return new LlmProviderError(message, { status: null, retryable: false });
}

function mapTransportError(
  error: unknown,
  outerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): LlmProviderError {
  if (outerSignal?.aborted) {
    return new LlmProviderError("OpenRouter request was aborted", {
      status: null,
      retryable: false,
      cause: error,
    });
  }
  if (error instanceof LlmProviderError) return error;
  if (timeoutSignal.aborted || isTimeout(error)) {
    return new LlmProviderError("OpenRouter request timed out", {
      status: 408,
      retryable: true,
      cause: error,
    });
  }
  const message = error instanceof Error && error.message.length > 0
    ? error.message
    : "OpenRouter request failed";
  return new LlmProviderError(message, { status: null, retryable: true, cause: error });
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function integerValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value;
}

function numericStatus(value: unknown): number | null {
  const status = integerValue(value);
  if (status === null || status < 100 || status > 599) return null;
  return status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
