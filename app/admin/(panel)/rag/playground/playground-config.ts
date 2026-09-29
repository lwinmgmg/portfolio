import type { RetrievalConfig } from "@/server/domain/rag";

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
