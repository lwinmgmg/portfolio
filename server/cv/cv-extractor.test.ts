import { expect, test } from "bun:test";

import { LlmCvExtractor, CvExtractionError } from "@/server/cv/cv-extractor";
import { CV_EXTRACTION_PROMPT } from "@/server/cv/extraction-prompt";
import { cvExtractionJsonSchema } from "@/server/cv/cv-schema";
import { sampleCv, sampleExtraction } from "@/server/cv/__fixtures__/sample-cv";
import type {
  ChatClient,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
} from "@/server/domain/llm";

class FakeChat implements ChatClient {
  readonly requests: ChatRequest[] = [];
  private readonly results: Array<ChatResult | Error>;

  constructor(results: Array<ChatResult | Error>) {
    this.results = [...results];
  }

  complete(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    const next = this.results.shift();
    if (!next) return Promise.reject(new Error("missing chat result"));
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  }

  stream(): AsyncIterable<ChatStreamEvent> {
    throw new Error("stream was not expected");
  }
}

function result(text: string, model = "deepseek/deepseek-v4.1-flash"): ChatResult {
  return { text, usage: null, model };
}

function extractor(chat: ChatClient, budgetMs?: number): LlmCvExtractor {
  return new LlmCvExtractor(chat, "configured-model", "pdf-to-md", budgetMs);
}

const pdf = Uint8Array.from([37, 80, 68, 70]);

function filePart(request: ChatRequest): { filename: string; dataUrl: string } | null {
  const message = request.messages.find((item) => item.role === "user");
  if (!message || typeof message.content === "string") return null;
  const file = message.content.find((part) => part.type === "file");
  return file?.type === "file" ? file : null;
}

test("extracts CV JSON and assigns ids from one model response", async () => {
  const chat = new FakeChat([result(JSON.stringify(sampleExtraction), "provider/actual")]);
  const extracted = await extractor(chat).extract(pdf, "resume.pdf");

  expect(extracted.model).toBe("provider/actual");
  expect(extracted.data).toEqual(sampleCv);
  expect(chat.requests.length).toBe(1);
  const request = chat.requests[0];
  expect(request?.model).toBe("configured-model");
  expect(request?.temperature).toBe(0);
  expect(request?.maxTokens).toBe(8000);
  expect(request?.pdfEngine).toBe("pdf-to-md");
  expect(request?.jsonSchema).toEqual({
    name: "cv_extraction",
    schema: cvExtractionJsonSchema(),
  });
  expect(request?.messages[0]).toEqual({ role: "system", content: CV_EXTRACTION_PROMPT });
  const file = request ? filePart(request) : null;
  expect(file?.filename).toBe("resume.pdf");
  expect(file?.dataUrl).toBe(`data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`);
  const instruction = request?.messages[1];
  expect(instruction?.role).toBe("user");
  if (instruction && typeof instruction.content !== "string") {
    const text = instruction.content.find((part) => part.type === "text");
    expect(text).toEqual({
      type: "text",
      text: "Extract the curriculum vitae in the attached PDF into the required JSON.",
    });
  }
});

test("accepts JSON wrapped in a markdown fence", async () => {
  const chat = new FakeChat([
    result(`\`\`\`json\n${JSON.stringify(sampleExtraction)}\n\`\`\``),
  ]);

  const extracted = await extractor(chat).extract(pdf, "resume.pdf");

  expect(extracted.data).toEqual(sampleCv);
  expect(chat.requests.length).toBe(1);
});

test("repairs one invalid extraction and keeps the same deadline", async () => {
  const chat = new FakeChat([
    result('{"profile":{"fullName":"Jane Doe"}}', "first-model"),
    result(JSON.stringify(sampleExtraction), ""),
  ]);

  const extracted = await extractor(chat).extract(pdf, "Jane Doe.pdf");

  expect(extracted.model).toBe("configured-model");
  expect(extracted.data).toEqual(sampleCv);
  expect(chat.requests.length).toBe(2);
  expect(chat.requests[0]?.signal).toBe(chat.requests[1]?.signal);
  const repair = chat.requests[1];
  expect(repair?.messages[2]).toEqual({
    role: "assistant",
    content: '{"profile":{"fullName":"Jane Doe"}}',
  });
  const correction = repair?.messages[3];
  expect(correction?.role).toBe("user");
  expect(typeof correction?.content).toBe("string");
  if (typeof correction?.content === "string") {
    expect(correction.content.includes("Return corrected JSON only.")).toBe(true);
    expect(correction.content.includes("profile.headline:")).toBe(true);
    expect(correction.content.includes('{"profile":{"fullName":"Jane Doe"}}')).toBe(true);
  }
  expect(filePart(repair ?? chat.requests[0])?.filename).toBe("Jane Doe.pdf");
});

test("throws CvExtractionError when the repair is still invalid", async () => {
  const chat = new FakeChat([result("{}"), result('{"nope":true}')]);

  let caught: unknown;
  try {
    await extractor(chat).extract(pdf, "resume.pdf");
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof CvExtractionError).toBe(true);
  if (caught instanceof CvExtractionError) {
    expect(caught.message.includes("CV extraction failed:")).toBe(true);
    expect(caught.issues.some((issue) => issue.startsWith("profile:"))).toBe(true);
  }
  expect(chat.requests.length).toBe(2);
});

test("repairs non-JSON output once and then rejects another non-JSON response", async () => {
  const chat = new FakeChat([result("not json"), result("still not json")]);

  let caught: unknown;
  try {
    await extractor(chat).extract(pdf, "resume.pdf");
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof CvExtractionError).toBe(true);
  if (caught instanceof CvExtractionError) {
    expect(caught.issues).toEqual(["Response was not valid JSON."]);
  }
  const correction = chat.requests[1]?.messages[3];
  expect(typeof correction?.content).toBe("string");
  if (typeof correction?.content === "string") {
    expect(correction.content.includes("Response was not valid JSON.")).toBe(true);
    expect(correction.content.includes("not json")).toBe(true);
  }
});

test("reports a timeout when the shared deadline aborts", async () => {
  const chat: ChatClient = {
    complete(request) {
      const signal = request.signal;
      return new Promise((_, reject) => {
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        const abort = () => reject(new Error("aborted"));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    },
    stream() {
      throw new Error("stream was not expected");
    },
  };

  let caught: unknown;
  try {
    await extractor(chat, 20).extract(pdf, "resume.pdf");
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof CvExtractionError).toBe(true);
  if (caught instanceof CvExtractionError) {
    expect(caught.message).toBe("Extraction timed out before it could finish.");
  }
});
