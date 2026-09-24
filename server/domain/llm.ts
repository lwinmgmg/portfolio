export type ChatRole = "system" | "user" | "assistant";

export type ContentPart =
  | { type: "text"; text: string; cacheControl?: boolean }
  | { type: "file"; filename: string; dataUrl: string };

export type ChatMessage = {
  role: ChatRole;
  content: string | ContentPart[];
};

export type JsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

/** Local Markdown conversion or an OpenRouter file-parser engine. */
export type PdfEngine = "pdf-to-md" | "native" | "cloudflare-ai" | "mistral-ocr";

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Maps to OpenRouter `response_format` json_schema with `strict: true`. */
  jsonSchema?: JsonSchemaFormat;
  pdfEngine?: PdfEngine;
  signal?: AbortSignal;
};

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  cost: number | null;
};

export type ChatResult = {
  text: string;
  usage: Usage | null;
  model: string;
};

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: Usage | null };

export interface ChatClient {
  complete(request: ChatRequest): Promise<ChatResult>;
  stream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}

export interface EmbeddingClient {
  embed(input: {
    model: string;
    texts: string[];
  }): Promise<{ vectors: number[][]; usage: Usage | null }>;
}

export type RerankResult = {
  index: number;
  score: number;
};

export interface RerankClient {
  rerank(input: {
    model: string;
    query: string;
    documents: string[];
    topN: number;
  }): Promise<RerankResult[]>;
}

export class LlmProviderError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      status: number | null;
      retryable: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LlmProviderError";
    this.status = options.status;
    this.retryable = options.retryable;
  }
}
