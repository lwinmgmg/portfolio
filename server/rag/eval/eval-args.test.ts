import { expect, test } from "bun:test";

import { thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import {
  DEFAULT_GOLDEN_PATH,
  EvalArgsError,
  parseEvalArgs,
} from "@/server/rag/eval/eval-args";
import { RETRIEVAL_PRESET_NAMES } from "@/server/rag/pipeline/retrieval-config";

test("defaults to the active index, every preset and k = 1, 3, 5", () => {
  expect(parseEvalArgs([])).toEqual({
    indexes: ["active"],
    presets: [...RETRIEVAL_PRESET_NAMES],
    ks: [1, 3, 5],
    tags: [],
    goldenPath: DEFAULT_GOLDEN_PATH,
    help: false,
  });
});

test("reads comma lists and repeated flags, dropping blanks and repeats", () => {
  const args = parseEvalArgs([
    "--index",
    "active,abc",
    "--index",
    "def, abc",
    "--presets",
    "hybrid, hybrid-rerank,,hybrid",
    "--k",
    "5,1,3,1",
    "--tag",
    "experience",
    "--tag=skills",
    "--golden",
    "evals/other.json",
  ]);
  expect(args).toMatchObject({
    indexes: ["active", "abc", "def"],
    presets: ["hybrid", "hybrid-rerank"],
    ks: [1, 3, 5],
    tags: ["experience", "skills"],
    goldenPath: "evals/other.json",
  });
});

test("accepts the saved chat config as the chat preset", () => {
  expect(parseEvalArgs(["--presets", "hybrid-rerank,chat"]).presets).toEqual(["hybrid-rerank", "chat"]);
});

test("ignores a leading -- separator from bun run", () => {
  expect(parseEvalArgs(["--", "--presets", "full"]).presets).toEqual(["full"]);
});

test("reads --help", () => {
  expect(parseEvalArgs(["--help"]).help).toBe(true);
});

test("rejects unknown presets, bad cutoffs, unknown flags and positionals", () => {
  const rejected = [
    ["--presets", "hybrid,best"],
    ["--k", "0"],
    ["--k", "11"],
    ["--k", "2.5"],
    ["--k", "three"],
    ["--limit", "3"],
    ["extra"],
  ];
  for (const argv of rejected) {
    expect(thrownBy(() => parseEvalArgs(argv)) instanceof EvalArgsError).toBe(true);
  }
});
