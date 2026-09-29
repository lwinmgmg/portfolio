import { CITATION_SOURCE } from "@/app/(public)/_components/chat/chat-markdown";
import { CV_LIST_SECTIONS } from "@/app/(public)/_components/cv/cv-sections";
import type { ChatSource } from "@/server/domain/chat";

// Chip numbers, 1-based. Once the sources arrive they decide the numbers (and ids they do not
// list get no chip); while streaming, ids are numbered in order of first use, as the server does.
export function citationNumbers(
  text: string,
  sources: readonly ChatSource[] | null,
): Map<string, number> {
  const ids = sources
    ? sources.map((source) => source.sourceId)
    : [...text.matchAll(new RegExp(CITATION_SOURCE, "g"))].flatMap((match) =>
        (match[1] ?? "").split(",").map((id) => id.trim()),
      );
  const numbers = new Map<string, number>();
  for (const id of ids) if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  return numbers;
}

const SECTION_LABELS: ReadonlyMap<string, string> = new Map([
  ["profile", "Profile"],
  ...Object.values(CV_LIST_SECTIONS).map(
    (section): [string, string] => [section.entityPrefix, section.label],
  ),
]);

// A source's `section` is an entity-key prefix ("project"); this is the CV section it sits in.
export function sourceSectionLabel(section: string): string {
  return SECTION_LABELS.get(section) ?? section;
}
