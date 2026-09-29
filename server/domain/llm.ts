export type ContentPart =
  | { type: "text"; text: string; cacheControl?: boolean }
  | { type: "file"; filename: string; dataUrl: string };

/** A function the model may call. `parameters` is a JSON Schema object. */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * A call the model made. `arguments` is the model's raw JSON text, unparsed: the client is a
 * transport, so the caller validates it. `id` and `name` are "" when the provider sent none.
 */
export type ToolCall = { id: string; name: string; arguments: string };

export type ToolChoice = "auto" | "none";

export type ChatMessage =
  | { role: "system" | "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | ContentPart[]; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type ChatRole = ChatMessage["role"];

export type JsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

/** Local Markdown conversion or an OpenRouter file-parser engine. */
export type PdfEngine = "pdf-to-md" | "native" | "cloudflare-ai" | "mistral-ocr";

export type ReasoningEffort = "low" | "medium" | "high";

/** Maps to OpenRouter `reasoning`. `{ enabled: false }` asks a reasoning model not to think. */
export type ReasoningSetting = { effort: ReasoningEffort } | { enabled: false };

/** A configured reasoning level, as in `LLM_ANSWER_REASONING`. */
export type ReasoningLevel = "off" | ReasoningEffort;

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Maps to OpenRouter `response_format` json_schema with `strict: true`. */
  jsonSchema?: JsonSchemaFormat;
  pdfEngine?: PdfEngine;
  /** Absent: the body has no `reasoning` key and the model uses its own default. */
  reasoning?: ReasoningSetting;
  /** Absent or empty: the body has no `tools` key. */
  tools?: ToolDefinition[];
  /** Maps to OpenRouter `tool_choice`. */
  toolChoice?: ToolChoice;
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
  /** Present only when the model called at least one tool. */
  toolCalls?: ToolCall[];
};

/** `tool_call` events come after every `delta`, one per assembled call, just before `done`. */
export type ChatStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
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
    signal?: AbortSignal;
  }): Promise<RerankResult[]>;
}

/** A Decisions API `choice` question: the model picks one key of `criteria`. */
export type DecisionQuestion = {
  type: "choice";
  instructions: string;
  /** Option key -> what that option means. */
  criteria: Record<string, string>;
};

export type DecisionRequest = {
  model: string;
  /** Any JSON value; the model reads it as the facts to decide on. */
  state: unknown;
  questions: Record<string, DecisionQuestion>;
  signal?: AbortSignal;
};

export type ChoiceAnswer = {
  choice: string;
  confidence: number;
  /** One probability per option key. */
  probabilities: Record<string, number>;
};

export type DecisionResult = {
  /** Keyed like the request's `questions`. */
  answers: Record<string, ChoiceAnswer>;
  model: string;
  usage: Usage | null;
};

export interface DecisionClient {
  decide(request: DecisionRequest): Promise<DecisionResult>;
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
