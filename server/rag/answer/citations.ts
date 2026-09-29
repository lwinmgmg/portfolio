import { anchorForEntityKey } from "@/app/(public)/_components/cv/cv-sections";
import type { ChatSource } from "@/server/domain/chat";
import type { RetrievedChunk } from "@/server/domain/rag";

export type CitableChunk = Pick<RetrievedChunk, "sourceId" | "entityKeys" | "title" | "section">;

// `[S1]`, and the grouped form `[S1, S2]` that models also write.
const CITATION_PATTERN = /\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]/g;
// A marker and the spaces before it, so "Acme [S1]." becomes "Acme.".
const CITATION_WITH_SPACE_PATTERN = new RegExp(`[ \\t]*${CITATION_PATTERN.source}`, "g");

// The sources an answer cites, in order of first use. Ids with no matching chunk are ignored.
export function extractCitations(text: string, chunks: readonly CitableChunk[]): ChatSource[] {
  const bySourceId = new Map(chunks.map((chunk) => [chunk.sourceId, chunk]));
  const seen = new Set<string>();
  const sources: ChatSource[] = [];
  for (const sourceId of citedIds(text)) {
    const chunk = bySourceId.get(sourceId);
    if (!chunk || seen.has(sourceId)) continue;
    seen.add(sourceId);
    sources.push({
      sourceId,
      entityKeys: [...chunk.entityKeys],
      title: chunk.title,
      section: chunk.section,
      anchor: entityAnchor(chunk.entityKeys),
    });
  }
  return sources;
}

// The CV entities behind the cited sources, without duplicates, in citation order.
export function citedEntityKeys(sources: readonly ChatSource[]): string[] {
  return [...new Set(sources.flatMap((source) => source.entityKeys))];
}

// Removes citation markers, e.g. from an old answer whose source ids no longer apply.
export function stripCitations(text: string): string {
  return text.replace(CITATION_WITH_SPACE_PATTERN, "").trim();
}

function citedIds(text: string): string[] {
  return [...text.matchAll(CITATION_PATTERN)].flatMap((match) =>
    (match[1] ?? "").split(",").map((id) => id.trim()),
  );
}

// The CV page fragment for a chunk, from its first entity key: `#experience-acme`, or null.
export function entityAnchor(entityKeys: readonly string[]): string | null {
  const first = entityKeys[0];
  const anchor = first === undefined ? null : anchorForEntityKey(first);
  return anchor === null ? null : `#${anchor}`;
}
