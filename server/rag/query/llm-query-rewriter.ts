import { z } from "zod";

import type { ChatClient } from "@/server/domain/llm";
import type { QueryRewriter, RewriteInput, RewriteResult } from "@/server/domain/rag";
import { unwrapJsonFence } from "@/server/llm/json-fence";
import { buildRewriteMessages, MAX_QUERY_VARIANTS } from "@/server/rag/query/rewrite-prompt";

// Rewriting sits on the chat path, so a slow provider falls back quickly. Retries included.
export const REWRITE_TIMEOUT_MS = 15_000;
export const REWRITE_MAX_TOKENS = 300;
const REWRITE_SCHEMA_NAME = "query_rewrite";

// Parsing ignores extra keys, so a model without structured outputs can still pass.
const RewriteOutputSchema = z.object({
  standalone: z.string(),
  variants: z.array(z.string()),
  scope: z.enum(["cv", "smalltalk", "off_topic", "contact"]),
});

type RewriteOutput = z.infer<typeof RewriteOutputSchema>;

// The strict form is what the provider enforces.
export function rewriteJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(z.strictObject(RewriteOutputSchema.shape));
}

class RewriteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewriteParseError";
  }
}

export type LlmQueryRewriterOptions = {
  timeoutMs?: number;
};

// Turns the latest chat message into search queries with one utility-model call, and classifies
// its scope. Any failure falls back to searching the message as written.
export class LlmQueryRewriter implements QueryRewriter {
  private readonly timeoutMs: number;

  constructor(
    private readonly chat: ChatClient,
    private readonly model: string,
    options: LlmQueryRewriterOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? REWRITE_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new RangeError("timeoutMs must be a positive integer.");
    }
  }

  async rewrite(input: RewriteInput): Promise<RewriteResult> {
    if (input.mode === "none") return { queries: [input.message], scope: "cv", raw: null };

    const multi = input.mode === "multi";
    try {
      const result = await this.chat.complete({
        model: this.model,
        messages: buildRewriteMessages({
          message: input.message,
          history: input.history,
          multi,
          subjectName: input.subjectName,
        }),
        temperature: 0,
        maxTokens: REWRITE_MAX_TOKENS,
        jsonSchema: { name: REWRITE_SCHEMA_NAME, schema: rewriteJsonSchema() },
        // A reasoning model otherwise spends the whole 300 tokens thinking and returns blank text.
        reasoning: { enabled: false },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const output = parseRewrite(result.text);
      const variants = multi ? output.variants : [];
      return {
        queries: uniqueQueries([output.standalone, ...variants]).slice(0, 1 + MAX_QUERY_VARIANTS),
        scope: output.scope,
        raw: output,
      };
    } catch (error) {
      return {
        queries: [input.message],
        scope: "cv",
        raw: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function parseRewrite(text: string): RewriteOutput {
  let value: unknown;
  try {
    value = JSON.parse(unwrapJsonFence(text));
  } catch {
    throw new RewriteParseError("Rewrite output was not valid JSON.");
  }
  const parsed = RewriteOutputSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    );
    throw new RewriteParseError(`Rewrite output was invalid: ${issues.join("; ")}`);
  }
  if (parsed.data.standalone.trim().length === 0) {
    throw new RewriteParseError("Rewrite output had a blank standalone query.");
  }
  return parsed.data;
}

// Trimmed, blanks dropped, first spelling kept among case-insensitive duplicates.
export function uniqueQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const query of queries) {
    const trimmed = query.trim();
    const key = trimmed.replace(/\s+/g, " ").toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}
