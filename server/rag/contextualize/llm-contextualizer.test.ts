import { expect, test } from "bun:test";

import type { ChatClient, ChatRequest, ChatResult } from "@/server/domain/llm";
import { sampleCorpus } from "@/server/rag/__fixtures__/sample-corpus";
import { composeIndexText } from "@/server/rag/contextualize/index-text";
import { LlmContextualizer } from "@/server/rag/contextualize/llm-contextualizer";
import { NoopContextualizer } from "@/server/rag/contextualize/noop-contextualizer";

// Answers "context for <chunk text>", or fails for texts in `failing`.
class FakeChat implements ChatClient {
  requests: ChatRequest[] = [];
  running = 0;
  peak = 0;

  constructor(private readonly failing: ReadonlySet<string> = new Set()) {}

  async complete(request: ChatRequest): Promise<ChatResult> {
    this.requests.push(request);
    this.running += 1;
    this.peak = Math.max(this.peak, this.running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.running -= 1;

    const chunk = chunkOf(request);
    if (this.failing.has(chunk)) throw new Error(`provider failed for ${chunk}`);
    return { text: chunk === "blank" ? "  \n" : `  context for ${chunk}\n`, usage: null, model: request.model };
  }

  stream(): AsyncIterable<never> {
    throw new Error("not used");
  }
}

function chunkOf(request: ChatRequest): string {
  const content = request.messages[0]?.content;
  const text = Array.isArray(content) && content[1]?.type === "text" ? content[1].text : "";
  return /<chunk>([\s\S]*)<\/chunk>/.exec(text)?.[1] ?? "";
}

const silent = () => {};

test("each chunk is sent with the cacheable document and the situating instruction", async () => {
  const chat = new FakeChat();

  await new LlmContextualizer(chat, "utility-model", { onError: silent }).contextualize(
    sampleCorpus,
    ["## Experience\n### Acme"],
  );

  const [request] = chat.requests;
  expect(request?.model).toBe("utility-model");
  expect(request?.temperature).toBe(0);
  expect(request?.maxTokens).toBe(150);
  expect(request?.reasoning).toEqual({ enabled: false });
  expect(request?.signal instanceof AbortSignal).toBe(true);
  expect(request?.messages.length).toBe(1);
  expect(request?.messages[0]?.role).toBe("user");
  const content = request?.messages[0]?.content;
  if (!Array.isArray(content)) throw new Error("expected content parts");
  expect(content[0]).toEqual({
    type: "text",
    text: `<document>${sampleCorpus.markdown}</document>`,
    cacheControl: true,
  });
  const instruction = content[1];
  if (instruction?.type !== "text") throw new Error("expected a text part");
  expect(instruction.text).toContain(
    "Here is the chunk we want to situate within the whole document:\n<chunk>## Experience\n### Acme</chunk>\n",
  );
  expect(instruction.text).toContain("1–2 sentences, max 60 words");
  expect(instruction.text).toContain("Answer only with the succinct context and nothing else.");
  expect(instruction.cacheControl).toBe(undefined);
});

test("contexts are trimmed and returned in chunk order", async () => {
  const chat = new FakeChat();
  const contexts = await new LlmContextualizer(chat, "m").contextualize(sampleCorpus, [
    "a",
    "b",
    "c",
  ]);

  expect(contexts).toEqual(["context for a", "context for b", "context for c"]);
});

test("at most `concurrency` calls are in flight", async () => {
  const chat = new FakeChat();
  const texts = Array.from({ length: 10 }, (_, index) => `chunk ${index}`);

  await new LlmContextualizer(chat, "m", { concurrency: 3 }).contextualize(sampleCorpus, texts);

  expect(chat.requests.length).toBe(10);
  expect(chat.peak).toBe(3);
});

test("the default concurrency is 4", async () => {
  const chat = new FakeChat();
  const texts = Array.from({ length: 9 }, (_, index) => `chunk ${index}`);

  await new LlmContextualizer(chat, "m").contextualize(sampleCorpus, texts);

  expect(chat.peak).toBe(4);
});

test("a failed or blank chunk becomes null without failing the others", async () => {
  const chat = new FakeChat(new Set(["b"]));
  const failures: number[] = [];

  const contexts = await new LlmContextualizer(chat, "m", {
    onError: (_error, index) => failures.push(index),
  }).contextualize(sampleCorpus, ["a", "b", "blank"]);

  expect(contexts).toEqual(["context for a", null, null]);
  expect(failures).toEqual([1]);
});

test("options are validated", () => {
  const chat = new FakeChat();
  for (const options of [{ concurrency: 0 }, { concurrency: 1.5 }, { timeoutMs: 0 }]) {
    let error: unknown = null;
    try {
      new LlmContextualizer(chat, "m", options);
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof RangeError).toBe(true);
  }
});

test("the noop contextualizer returns null for every text", async () => {
  expect(await new NoopContextualizer().contextualize(sampleCorpus, ["a", "b"])).toEqual([
    null,
    null,
  ]);
});

test("index text puts the context before the chunk", () => {
  expect(composeIndexText("Jane's role at Acme.", "## Experience")).toBe(
    "Jane's role at Acme.\n\n## Experience",
  );
  expect(composeIndexText(null, "## Experience")).toBe("## Experience");
});
