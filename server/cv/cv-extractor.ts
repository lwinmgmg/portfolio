import { assignIds } from "@/server/cv/cv-ids";
import { CvExtractionSchema, cvExtractionJsonSchema } from "@/server/cv/cv-schema";
import { CV_EXTRACTION_PROMPT } from "@/server/cv/extraction-prompt";
import type { CvData, CvExtraction, CvExtractor } from "@/server/domain/cv";
import type { ChatClient, ChatMessage, ChatRequest, ChatResult, PdfEngine } from "@/server/domain/llm";

/** Conversion, the extraction request, and one repair stay inside the 60s admin route. */
export const CV_EXTRACTION_BUDGET_MS = 45_000;

const EXTRACTION_TEMPERATURE = 0;
const EXTRACTION_MAX_TOKENS = 8000;
const EXTRACTION_SCHEMA_NAME = "cv_extraction";

export class CvExtractionError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = "CvExtractionError";
    this.issues = issues;
  }
}

export class LlmCvExtractor implements CvExtractor {
  constructor(
    private readonly chat: ChatClient,
    private readonly model: string,
    private readonly pdfEngine: PdfEngine,
    private readonly budgetMs: number = CV_EXTRACTION_BUDGET_MS,
  ) {}

  async extract(pdf: Uint8Array, filename: string): Promise<{ data: CvData; model: string }> {
    const deadline = AbortSignal.timeout(this.budgetMs);
    const messages: ChatMessage[] = [
      { role: "system", content: CV_EXTRACTION_PROMPT },
      userMessage(pdf, filename),
    ];

    const first = await this.complete(messages, deadline);
    const parsed = parseExtraction(first.text);
    if (parsed.ok) return { data: assignIds(parsed.data), model: this.modelName(first) };

    messages.push({ role: "assistant", content: first.text });
    messages.push({ role: "user", content: repairInstruction(first.text, parsed.issues) });
    const repaired = await this.complete(messages, deadline);
    const second = parseExtraction(repaired.text);
    if (!second.ok) throw extractionError(second.issues);
    return { data: assignIds(second.data), model: this.modelName(repaired) };
  }

  private async complete(messages: ChatMessage[], deadline: AbortSignal): Promise<ChatResult> {
    try {
      return await this.chat.complete(this.request(messages, deadline));
    } catch (error) {
      if (deadline.aborted) {
        throw new CvExtractionError("Extraction timed out before it could finish.", [
          "Extraction timed out before it could finish.",
        ]);
      }
      throw error;
    }
  }

  private request(messages: ChatMessage[], signal: AbortSignal): ChatRequest {
    return {
      model: this.model,
      messages,
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
      jsonSchema: {
        name: EXTRACTION_SCHEMA_NAME,
        schema: cvExtractionJsonSchema(),
      },
      pdfEngine: this.pdfEngine,
      signal,
    };
  }

  private modelName(result: ChatResult): string {
    const reported = result.model.trim();
    return reported.length > 0 ? reported : this.model;
  }
}

function userMessage(pdf: Uint8Array, filename: string): ChatMessage {
  return {
    role: "user",
    content: [
      {
        type: "file",
        filename,
        dataUrl: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`,
      },
      {
        type: "text",
        text: "Extract the curriculum vitae in the attached PDF into the required JSON.",
      },
    ],
  };
}

function repairInstruction(previous: string, issues: readonly string[]): string {
  return [
    "The previous extraction JSON failed validation. Return corrected JSON only.",
    "Validation issues:",
    ...issues.map((issue) => `- ${issue}`),
    "Previous output:",
    previous,
  ].join("\n");
}

type ParseResult = { ok: true; data: CvExtraction } | { ok: false; issues: string[] };

function parseExtraction(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(unwrapFence(text));
  } catch {
    return { ok: false, issues: ["Response was not valid JSON."] };
  }

  const parsed = CvExtractionSchema.safeParse(value);
  if (!parsed.success) return { ok: false, issues: formatIssues(parsed.error.issues) };
  return { ok: true, data: parsed.data };
}

function unwrapFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[^\n]*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map((part) => String(part)).join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

function extractionError(issues: readonly string[]): CvExtractionError {
  const detail = issues.length > 0 ? issues.join("; ") : "The model returned invalid CV JSON.";
  return new CvExtractionError(`CV extraction failed: ${detail}`, issues);
}
