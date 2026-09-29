import { expect, test } from "bun:test";

import { configRows, matchingPreset } from "@/app/admin/(panel)/rag/playground/playground-config";
import { DEFAULT_RETRIEVAL_CONFIG, RETRIEVAL_PRESETS } from "@/server/rag/pipeline/retrieval-config";

test("configRows lists every field by its label", () => {
  expect(configRows({ ...DEFAULT_RETRIEVAL_CONFIG, minRerankScore: 0.2 })).toEqual([
    { label: "Query rewrite", value: "standalone" },
    { label: "Search", value: "hybrid" },
    { label: "Candidates per search", value: "20" },
    { label: "RRF k", value: "60" },
    { label: "Fused limit", value: "20" },
    { label: "Rerank", value: "on" },
    { label: "Final k", value: "5" },
    { label: "Min rerank score", value: "0.2" },
    { label: "Ignore name in BM25", value: "on" },
    { label: "Ignore name in rerank", value: "on" },
    { label: "Drop below mean rerank", value: "on" },
  ]);
});

test("matchingPreset prefers the first matching name, so the chat config wins a tie", () => {
  const presets = { chat: DEFAULT_RETRIEVAL_CONFIG, ...RETRIEVAL_PRESETS };

  expect(matchingPreset(DEFAULT_RETRIEVAL_CONFIG, presets)).toBe("chat");
  expect(matchingPreset(RETRIEVAL_PRESETS.full, presets)).toBe("full");
  expect(matchingPreset({ ...DEFAULT_RETRIEVAL_CONFIG, minRerankScore: 0.2 }, presets)).toBeNull();
});
