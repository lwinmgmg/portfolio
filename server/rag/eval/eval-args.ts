import { parseArgs } from "node:util";

import { RECIPROCAL_RANK_DEPTH } from "@/server/rag/eval/metrics";
import {
  isRetrievalPresetName,
  RETRIEVAL_PRESET_NAMES,
  type RetrievalPresetName,
} from "@/server/rag/pipeline/retrieval-config";

export const ACTIVE_INDEX = "active";
export const DEFAULT_GOLDEN_PATH = "evals/cv-retrieval.golden.json";
export const DEFAULT_CUTOFFS: readonly number[] = [1, 3, 5];

export type EvalArgs = {
  // Index ids, or ACTIVE_INDEX. Distinct, in the order given.
  indexes: string[];
  presets: RetrievalPresetName[];
  // Distinct and ascending.
  ks: number[];
  tags: string[];
  goldenPath: string;
  help: boolean;
};

export const EVAL_USAGE = `Usage: bun run eval:rag -- [options]

  --index <id|active>[,...]   Indexes to compare (default: active). Repeatable.
  --presets <name>[,...]      Retrieval presets (default: all).
                              ${RETRIEVAL_PRESET_NAMES.join(", ")}
  --k <n>[,...]               Cutoffs for hit@k and recall@k, 1..${RECIPROCAL_RANK_DEPTH} (default: ${DEFAULT_CUTOFFS.join(",")}).
  --tag <tag>[,...]           Only questions with any of these tags. Repeatable.
  --golden <path>             Golden file (default: ${DEFAULT_GOLDEN_PATH}).
  --help                      Show this help.`;

export class EvalArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalArgsError";
  }
}

// Comma-separated values from one or more flags, trimmed, blanks and repeats dropped.
function list(values: readonly string[] | string | undefined): string[] {
  const raw = values === undefined ? [] : typeof values === "string" ? [values] : values;
  const items = raw.flatMap((value) => value.split(",")).map((item) => item.trim());
  return [...new Set(items.filter((item) => item.length > 0))];
}

function parseCutoff(value: string): number {
  const k = Number(value);
  if (!/^\d+$/.test(value) || k < 1 || k > RECIPROCAL_RANK_DEPTH) {
    throw new EvalArgsError(`--k takes integers from 1 to ${RECIPROCAL_RANK_DEPTH}, got "${value}".`);
  }
  return k;
}

function readFlags(args: string[]) {
  try {
    return parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        index: { type: "string", multiple: true },
        presets: { type: "string" },
        k: { type: "string" },
        tag: { type: "string", multiple: true },
        golden: { type: "string" },
        help: { type: "boolean" },
      },
    }).values;
  } catch (error) {
    throw new EvalArgsError(error instanceof Error ? error.message : String(error));
  }
}

export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  // `bun run script -- args` may pass the separator through.
  const values = readFlags(argv[0] === "--" ? argv.slice(1) : [...argv]);

  const presetNames = list(values.presets);
  const presets: RetrievalPresetName[] = [];
  for (const name of presetNames) {
    if (!isRetrievalPresetName(name)) throw new EvalArgsError(`Unknown preset "${name}".`);
    presets.push(name);
  }

  const cutoffs = list(values.k);
  const ks = cutoffs.length > 0 ? cutoffs.map(parseCutoff) : [...DEFAULT_CUTOFFS];
  const indexes = list(values.index);
  const goldenPath = values.golden?.trim();

  return {
    indexes: indexes.length > 0 ? indexes : [ACTIVE_INDEX],
    presets: presets.length > 0 ? presets : [...RETRIEVAL_PRESET_NAMES],
    ks: [...new Set(ks)].sort((a, b) => a - b),
    tags: list(values.tag),
    goldenPath: goldenPath ? goldenPath : DEFAULT_GOLDEN_PATH,
    help: values.help ?? false,
  };
}
