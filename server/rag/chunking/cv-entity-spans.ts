import { listEntityKeys, renderCvEntity } from "@/server/cv/cv-markdown";
import type { CvData } from "@/server/domain/cv";
import { ChunkingError } from "@/server/rag/chunking/chunking-error";
import type { TextSpan } from "@/server/rag/chunking/text-spans";

export type EntitySpan = TextSpan & { entityKey: string };

// The chunk `section` of an entity: its key prefix (`experience:acme` → `experience`).
export function entitySection(entityKey: string): string {
  const separator = entityKey.indexOf(":");
  return separator === -1 ? entityKey : entityKey.slice(0, separator);
}

// Where each entity's rendering sits inside the canonical markdown, in document order.
// `renderCvMarkdown` keeps every entity block intact, so each one must be found verbatim.
// The search moves forward from the previous match, so identical renderings map to
// consecutive occurrences.
export function locateEntitySpans(data: CvData, markdown: string): EntitySpan[] {
  let cursor = 0;
  return listEntityKeys(data).map((entityKey) => {
    const text = renderCvEntity(data, entityKey);
    const start = markdown.indexOf(text, cursor);
    if (start === -1) {
      throw new ChunkingError(`CV entity "${entityKey}" was not found in the corpus markdown.`);
    }
    cursor = start + text.length;
    return { entityKey, start, end: cursor };
  });
}
