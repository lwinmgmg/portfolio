import { expect, test } from "bun:test";

import { LlmProviderError, type RerankClient, type RerankResult } from "@/server/domain/llm";
import type { RerankCandidate } from "@/server/domain/rag";
import { ApiReranker } from "@/server/rag/rerank/api-reranker";
import { PassthroughReranker } from "@/server/rag/rerank/passthrough-reranker";

type RerankRequest = Parameters<RerankClient["rerank"]>[0];

// Replies with `reply`, throws it when it is an Error, or calls it with the request.
class FakeRerankClient implements RerankClient {
  requests: RerankRequest[] = [];

  constructor(
    private readonly reply:
      | RerankResult[]
      | Error
      | ((request: RerankRequest) => Promise<RerankResult[]>),
  ) {}

  async rerank(request: RerankRequest): Promise<RerankResult[]> {
    this.requests.push(request);
    if (this.reply instanceof Error) throw this.reply;
    if (typeof this.reply === "function") return this.reply(request);
    return this.reply;
  }
}

const candidates: RerankCandidate[] = [
  { chunkId: "c-exp", text: "Context: experience.\n\nStaff engineer at Acme." },
  { chunkId: "c-edu", text: "BSc Computer Science." },
  { chunkId: "c-skills", text: "TypeScript, Go, PostgreSQL." },
  { chunkId: "c-proj", text: "Built a search engine." },
];

test("passthrough keeps the candidate order, scores 1 / rank and cuts to topN", async () => {
  const outcome = await new PassthroughReranker().rerank("anything", candidates, 3);

  expect(outcome).toEqual({
    hits: [
      { chunkId: "c-exp", score: 1 },
      { chunkId: "c-edu", score: 0.5 },
      { chunkId: "c-skills", score: 1 / 3 },
    ],
    fallback: false,
    error: null,
  });
});

test("passthrough returns every candidate when topN exceeds them", async () => {
  const outcome = await new PassthroughReranker().rerank("q", candidates.slice(0, 2), 5);

  expect(outcome.hits.map((hit) => hit.chunkId)).toEqual(["c-exp", "c-edu"]);
});

test("the API reranker sends the candidate texts in order and maps indices back to chunk ids", async () => {
  const client = new FakeRerankClient([
    { index: 3, score: 0.91 },
    { index: 0, score: 0.42 },
    { index: 2, score: 0.07 },
  ]);

  const outcome = await new ApiReranker(client, "rerank-x").rerank("search work", candidates, 3);

  expect(outcome).toEqual({
    hits: [
      { chunkId: "c-proj", score: 0.91 },
      { chunkId: "c-exp", score: 0.42 },
      { chunkId: "c-skills", score: 0.07 },
    ],
    fallback: false,
    error: null,
  });
  expect(client.requests.length).toBe(1);
  const [request] = client.requests;
  expect(request?.model).toBe("rerank-x");
  expect(request?.query).toBe("search work");
  expect(request?.documents).toEqual(candidates.map((candidate) => candidate.text));
  expect(request?.topN).toBe(3);
  expect(request?.signal instanceof AbortSignal).toBe(true);
});

test("the API reranker sorts by score itself, keeps candidate order on ties, and cuts to topN", async () => {
  const client = new FakeRerankClient([
    { index: 2, score: 0.5 },
    { index: 1, score: 0.9 },
    { index: 0, score: 0.5 },
    { index: 3, score: 0.1 },
  ]);

  const outcome = await new ApiReranker(client, "rerank-x").rerank("q", candidates, 3);

  expect(outcome.hits).toEqual([
    { chunkId: "c-edu", score: 0.9 },
    { chunkId: "c-exp", score: 0.5 },
    { chunkId: "c-skills", score: 0.5 },
  ]);
});

test("the API reranker asks for no more results than there are candidates", async () => {
  const client = new FakeRerankClient([{ index: 1, score: 0.8 }, { index: 0, score: 0.3 }]);

  await new ApiReranker(client, "rerank-x").rerank("q", candidates.slice(0, 2), 5);

  expect(client.requests[0]?.topN).toBe(2);
});

test("the API reranker makes no call for no candidates", async () => {
  const client = new FakeRerankClient([]);

  const outcome = await new ApiReranker(client, "rerank-x").rerank("q", [], 5);

  expect(outcome).toEqual({ hits: [], fallback: false, error: null });
  expect(client.requests.length).toBe(0);
});

test("a provider error falls back to the candidate order and is reported", async () => {
  const client = new FakeRerankClient(
    new LlmProviderError("rerank model unavailable", { status: 503, retryable: true }),
  );

  const outcome = await new ApiReranker(client, "rerank-x").rerank("q", candidates, 2);

  expect(outcome).toEqual({
    hits: [
      { chunkId: "c-exp", score: 1 },
      { chunkId: "c-edu", score: 0.5 },
    ],
    fallback: true,
    error: "rerank model unavailable",
  });
});

test("a result index outside the candidates falls back", async () => {
  const client = new FakeRerankClient([{ index: 4, score: 0.9 }]);

  const outcome = await new ApiReranker(client, "rerank-x").rerank("q", candidates, 2);

  expect(outcome.fallback).toBe(true);
  expect(outcome.error).toBe("Rerank result index 4 is outside the 4 documents sent.");
  expect(outcome.hits.map((hit) => hit.chunkId)).toEqual(["c-exp", "c-edu"]);
});

test("a document scored twice falls back", async () => {
  const client = new FakeRerankClient([
    { index: 1, score: 0.9 },
    { index: 1, score: 0.8 },
  ]);

  const outcome = await new ApiReranker(client, "rerank-x").rerank("q", candidates, 2);

  expect(outcome.fallback).toBe(true);
  expect(outcome.error).toBe("Rerank results list document 1 twice.");
});

test("a slow provider is aborted after the timeout and falls back", async () => {
  const client = new FakeRerankClient(
    (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => reject(new LlmProviderError("OpenRouter request was aborted", {
            status: null,
            retryable: false,
          })),
          { once: true },
        );
      }),
  );

  const outcome = await new ApiReranker(client, "rerank-x", { timeoutMs: 5 }).rerank(
    "q",
    candidates,
    1,
  );

  expect(outcome).toEqual({
    hits: [{ chunkId: "c-exp", score: 1 }],
    fallback: true,
    error: "OpenRouter request was aborted",
  });
});

test("an invalid topN or timeout is a programming error, not a fallback", async () => {
  const reranker = new ApiReranker(new FakeRerankClient([]), "rerank-x");

  expect(() => new ApiReranker(new FakeRerankClient([]), "m", { timeoutMs: 0 })).toThrow();
  await expect(reranker.rerank("q", candidates, 0)).rejects.toBeInstanceOf(RangeError);
  await expect(new PassthroughReranker().rerank("q", candidates, 1.5)).rejects.toBeInstanceOf(
    RangeError,
  );
});
