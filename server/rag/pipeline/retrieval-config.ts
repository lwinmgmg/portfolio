import { z } from "zod";

import type { RetrievalConfig } from "@/server/domain/rag";
import {
  QUERY_REWRITE_MODES,
  RETRIEVAL_FIELD_LABELS,
  RETRIEVAL_NUMBER_FIELDS,
  SEARCH_MODES,
  type NumberField,
} from "@/server/rag/pipeline/retrieval-config-fields";

const boundedInt = ({ min, max, default: fallback }: NumberField) =>
  z.int().min(min).max(max).default(fallback);

const fields = RETRIEVAL_NUMBER_FIELDS;

// Every field has a default, so `parse({})` yields the default config.
export const RetrievalConfigSchema = z.strictObject({
  rewrite: z.enum(QUERY_REWRITE_MODES).default("standalone"),
  search: z.enum(SEARCH_MODES).default("hybrid"),
  candidatesPerSearch: boundedInt(fields.candidatesPerSearch),
  rrfK: boundedInt(fields.rrfK),
  fusedLimit: boundedInt(fields.fusedLimit),
  rerank: z.boolean().default(true),
  finalK: boundedInt(fields.finalK),
  minRerankScore: z
    .number()
    .min(fields.minRerankScore.min)
    .max(fields.minRerankScore.max)
    .default(fields.minRerankScore.default),
  ignoreSubjectInLexical: z.boolean().default(true),
  ignoreSubjectInRerank: z.boolean().default(true),
  dropBelowMeanRerank: z.boolean().default(true),
}) satisfies z.ZodType<RetrievalConfig>;

export const DEFAULT_RETRIEVAL_CONFIG: Readonly<RetrievalConfig> = Object.freeze(
  RetrievalConfigSchema.parse({}),
);

// The first problem, named by the field's form label, e.g. "Final k: Too big: expected ...".
export function retrievalConfigErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path[0];
  const label =
    typeof field === "string" && field in RETRIEVAL_FIELD_LABELS
      ? RETRIEVAL_FIELD_LABELS[field as keyof RetrievalConfig]
      : "Config";
  return `${label}: ${issue?.message ?? "invalid value"}.`;
}

export const RETRIEVAL_PRESET_NAMES = [
  "vector-only",
  "lexical-only",
  "hybrid",
  "hybrid-rerank",
  "hybrid-rerank-rewrite",
  "full",
] as const;

export type RetrievalPresetName = (typeof RETRIEVAL_PRESET_NAMES)[number];

type PresetShape = Pick<RetrievalConfig, "rewrite" | "search" | "rerank">;

// Presets differ only in rewriting, search mode and reranking, so their results are comparable.
const PRESET_SHAPES: Record<RetrievalPresetName, PresetShape> = {
  "vector-only": { rewrite: "none", search: "vector", rerank: false },
  "lexical-only": { rewrite: "none", search: "lexical", rerank: false },
  hybrid: { rewrite: "none", search: "hybrid", rerank: false },
  "hybrid-rerank": { rewrite: "none", search: "hybrid", rerank: true },
  "hybrid-rerank-rewrite": { rewrite: "standalone", search: "hybrid", rerank: true },
  full: { rewrite: "multi", search: "hybrid", rerank: true },
};

export const RETRIEVAL_PRESETS: Readonly<Record<RetrievalPresetName, Readonly<RetrievalConfig>>> =
  Object.freeze(
    Object.fromEntries(
      RETRIEVAL_PRESET_NAMES.map((name) => [
        name,
        Object.freeze({ ...DEFAULT_RETRIEVAL_CONFIG, ...PRESET_SHAPES[name] }),
      ]),
    ) as Record<RetrievalPresetName, Readonly<RetrievalConfig>>,
  );

export function isRetrievalPresetName(value: string): value is RetrievalPresetName {
  return (RETRIEVAL_PRESET_NAMES as readonly string[]).includes(value);
}
