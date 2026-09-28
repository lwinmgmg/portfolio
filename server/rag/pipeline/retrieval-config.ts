import { z } from "zod";

import type { RetrievalConfig } from "@/server/domain/rag";

const boundedInt = (min: number, max: number, fallback: number) =>
  z.int().min(min).max(max).default(fallback);

// Every field has a default, so `parse({})` yields the default config.
export const RetrievalConfigSchema = z.strictObject({
  rewrite: z.enum(["none", "standalone", "multi"]).default("standalone"),
  search: z.enum(["vector", "lexical", "hybrid"]).default("hybrid"),
  candidatesPerSearch: boundedInt(1, 50, 20),
  rrfK: boundedInt(1, 200, 60),
  fusedLimit: boundedInt(1, 50, 20),
  rerank: z.boolean().default(true),
  finalK: boundedInt(1, 10, 5),
  minRerankScore: z.number().min(0).max(1).default(0),
}) satisfies z.ZodType<RetrievalConfig>;

export const DEFAULT_RETRIEVAL_CONFIG: Readonly<RetrievalConfig> = Object.freeze(
  RetrievalConfigSchema.parse({}),
);

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
