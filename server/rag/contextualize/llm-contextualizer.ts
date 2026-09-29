import type { ChatClient } from "@/server/domain/llm";
import type { Contextualizer, CorpusDocument } from "@/server/domain/rag";
import {
  buildContextMessages,
  CONTEXT_MAX_TOKENS,
} from "@/server/rag/contextualize/context-prompt";
import { mapWithConcurrency } from "@/server/rag/map-with-concurrency";

export const CONTEXT_CONCURRENCY = 4;
// Per chunk, retries included. Keeps one slow call from eating the whole build budget.
export const CONTEXT_TIMEOUT_MS = 20_000;

export type LlmContextualizerOptions = {
  concurrency?: number;
  timeoutMs?: number;
  // Called for each chunk whose context could not be written. Defaults to console.warn.
  onError?: (error: unknown, index: number) => void;
};

// Writes a short situating context for each chunk (contextual retrieval). A failed chunk gets
// null, so one bad call only costs that chunk its context, not the whole build.
export class LlmContextualizer implements Contextualizer {
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly onError: (error: unknown, index: number) => void;

  constructor(
    private readonly chat: ChatClient,
    private readonly model: string,
    options: LlmContextualizerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? CONTEXT_CONCURRENCY;
    this.timeoutMs = options.timeoutMs ?? CONTEXT_TIMEOUT_MS;
    this.onError = options.onError ?? warnContextFailure;
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1) {
      throw new RangeError("concurrency must be a positive integer.");
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new RangeError("timeoutMs must be a positive integer.");
    }
  }

  contextualize(doc: CorpusDocument, texts: string[]): Promise<(string | null)[]> {
    return mapWithConcurrency(texts, this.concurrency, (text, index) =>
      this.contextFor(doc.markdown, text, index),
    );
  }

  private async contextFor(
    markdown: string,
    text: string,
    index: number,
  ): Promise<string | null> {
    try {
      const result = await this.chat.complete({
        model: this.model,
        messages: buildContextMessages(markdown, text),
        temperature: 0,
        maxTokens: CONTEXT_MAX_TOKENS,
        // A reasoning model otherwise spends the whole 150 tokens thinking and returns blank text.
        reasoning: { enabled: false },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const context = result.text.trim();
      return context.length > 0 ? context : null;
    } catch (error) {
      this.onError(error, index);
      return null;
    }
  }
}

function warnContextFailure(error: unknown, index: number): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`Chunk ${index} has no context: ${reason}`);
}
