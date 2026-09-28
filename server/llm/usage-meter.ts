import type {
  ChatClient,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  EmbeddingClient,
  Usage,
} from "@/server/domain/llm";

// Adds up the usage of every call made through the clients it wraps (decorators), so a
// multi-step job such as an index build can report what it cost.
export class UsageMeter {
  private promptTokens = 0;
  private completionTokens = 0;
  private cost = 0;
  private costed = false;

  record(usage: Usage | null): void {
    if (usage === null) return;
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    if (usage.cost !== null) {
      this.cost += usage.cost;
      this.costed = true;
    }
  }

  // Null when no call reported a cost. Calls without a cost add nothing.
  get costUsd(): number | null {
    return this.costed ? this.cost : null;
  }

  get tokens(): { prompt: number; completion: number } {
    return { prompt: this.promptTokens, completion: this.completionTokens };
  }

  chat(client: ChatClient): ChatClient {
    return new MeteredChatClient(client, this);
  }

  embeddings(client: EmbeddingClient): EmbeddingClient {
    return new MeteredEmbeddingClient(client, this);
  }
}

class MeteredChatClient implements ChatClient {
  constructor(
    private readonly inner: ChatClient,
    private readonly meter: UsageMeter,
  ) {}

  async complete(request: ChatRequest): Promise<ChatResult> {
    const result = await this.inner.complete(request);
    this.meter.record(result.usage);
    return result;
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    for await (const event of this.inner.stream(request)) {
      if (event.type === "done") this.meter.record(event.usage);
      yield event;
    }
  }
}

class MeteredEmbeddingClient implements EmbeddingClient {
  constructor(
    private readonly inner: EmbeddingClient,
    private readonly meter: UsageMeter,
  ) {}

  async embed(input: {
    model: string;
    texts: string[];
  }): Promise<{ vectors: number[][]; usage: Usage | null }> {
    const result = await this.inner.embed(input);
    this.meter.record(result.usage);
    return result;
  }
}
