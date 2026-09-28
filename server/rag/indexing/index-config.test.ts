import { expect, test } from "bun:test";

import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import {
  defaultIndexConfig,
  indexConfigFor,
  InvalidIndexConfigError,
  parseIndexConfig,
} from "@/server/rag/indexing/index-config";
import { isChunkerKind } from "@/server/rag/indexing/chunker-kinds";

const models = { EMBEDDING_MODEL: "embed-model", LLM_UTILITY_MODEL: "utility-model" };

test("the default index is structured and contextualized with the env models", () => {
  expect(defaultIndexConfig(models)).toEqual({
    chunker: "structured",
    contextualize: true,
    embeddingModel: "embed-model",
    contextModel: "utility-model",
  });
});

test("a non-contextualized index has no context model", () => {
  expect(indexConfigFor({ chunker: "token-window", contextualize: false }, models)).toEqual({
    chunker: "token-window",
    contextualize: false,
    embeddingModel: "embed-model",
    contextModel: null,
  });
});

test("parseIndexConfig accepts a valid config and trims model names", () => {
  expect(
    parseIndexConfig({
      chunker: "structured",
      contextualize: true,
      embeddingModel: " e ",
      contextModel: " c ",
    }),
  ).toEqual({ chunker: "structured", contextualize: true, embeddingModel: "e", contextModel: "c" });
});

test("parseIndexConfig rejects unknown chunkers, blank models and a mismatched context model", () => {
  const valid = { chunker: "structured", contextualize: false, embeddingModel: "e", contextModel: null };
  for (const input of [
    { ...valid, chunker: "sentences" },
    { ...valid, embeddingModel: "  " },
    { ...valid, contextModel: "c" },
    { ...valid, contextualize: true },
    { ...valid, extra: 1 },
    null,
  ]) {
    expect(thrownBy(() => parseIndexConfig(input)) instanceof InvalidIndexConfigError).toBe(true);
  }
});

test("isChunkerKind recognizes the two chunkers", () => {
  expect(isChunkerKind("structured")).toBe(true);
  expect(isChunkerKind("token-window")).toBe(true);
  expect(isChunkerKind("sentences")).toBe(false);
  expect(isChunkerKind(null)).toBe(false);
});
