import type { ChunkerKind } from "@/server/domain/rag";

// Dependency-free so client components (the admin build form) can import it.
export const CHUNKER_KINDS = ["structured", "token-window"] as const satisfies readonly ChunkerKind[];

export const CHUNKER_LABELS: Readonly<Record<ChunkerKind, string>> = {
  structured: "Structured (one chunk per CV entry)",
  "token-window": "Token window (200 tokens, 40 overlap)",
};

export function isChunkerKind(value: unknown): value is ChunkerKind {
  return CHUNKER_KINDS.some((kind) => kind === value);
}
