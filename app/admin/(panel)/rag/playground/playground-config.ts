import type { RetrievalConfig } from "@/server/domain/rag";
import { RETRIEVAL_FIELD_LABELS } from "@/server/rag/pipeline/retrieval-config-fields";

// Client-safe config helpers: no zod, so the playground form stays small.

const CONFIG_FIELDS = [
  "rewrite",
  "search",
  "candidatesPerSearch",
  "rrfK",
  "fusedLimit",
  "rerank",
  "finalK",
  "minRerankScore",
  "ignoreSubjectInLexical",
  "ignoreSubjectInRerank",
  "dropBelowMeanRerank",
  "scopeRouter",
  "minRouteConfidence",
] as const satisfies readonly (keyof RetrievalConfig)[];

export function sameConfig(a: RetrievalConfig, b: RetrievalConfig): boolean {
  return CONFIG_FIELDS.every((field) => a[field] === b[field]);
}

// The preset the config equals, so the preset select can show "Custom" after an edit.
export function matchingPreset<Name extends string>(
  config: RetrievalConfig,
  presets: Readonly<Record<Name, Readonly<RetrievalConfig>>>,
): Name | null {
  const names = Object.keys(presets) as Name[];
  return names.find((name) => sameConfig(config, presets[name])) ?? null;
}

// Every field as its form label and value, in form order.
export function configRows(config: RetrievalConfig): { label: string; value: string }[] {
  return CONFIG_FIELDS.map((field) => {
    const value = config[field];
    return {
      label: RETRIEVAL_FIELD_LABELS[field],
      value: typeof value === "boolean" ? (value ? "on" : "off") : String(value),
    };
  });
}
