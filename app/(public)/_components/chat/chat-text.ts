import { CV_LIST_SECTIONS } from "@/app/(public)/_components/cv/cv-sections";
import type { ChatSource } from "@/server/domain/chat";

// Answers are shown as plain text: paragraphs, `-` lists and citation chips. No markup is
// interpreted, so nothing the model writes can inject HTML.

export type InlinePart = { kind: "text"; text: string } | { kind: "cite"; sourceId: string };

export type AnswerBlock =
  | { kind: "paragraph"; parts: InlinePart[] }
  | { kind: "list"; items: InlinePart[][] };

// `[S1]` and `[S1, S2]`, with the spaces before them, as the server's citation parser reads them.
const CITATION = /[ \t]*\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]/g;
// A marker the stream has not finished yet, e.g. "[S" or "[S1, S2" at the very end.
const PENDING_CITATION = /[ \t]*\[\s*(?:S\d*(?:\s*,\s*(?:S\d*)?)*)?$/;
const LIST_ITEM = /^\s*[-*•]\s+/;

export function parseAnswer(text: string, streaming: boolean): AnswerBlock[] {
  const visible = streaming ? text.replace(PENDING_CITATION, "") : text;
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: InlinePart[][] | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", parts: inlineParts(paragraph.join("\n")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: "list", items: list });
      list = null;
    }
  };

  for (const line of visible.split("\n")) {
    if (!line.trim()) {
      flush();
    } else if (LIST_ITEM.test(line)) {
      if (paragraph.length > 0) flush();
      list ??= [];
      list.push(inlineParts(line.replace(LIST_ITEM, "")));
    } else if (list) {
      // A line under a list item continues it.
      const last = list.at(-1);
      if (last) last.push({ kind: "text", text: " " }, ...inlineParts(line.trim()));
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    if (match.index > last) parts.push({ kind: "text", text: text.slice(last, match.index) });
    for (const sourceId of (match[1] ?? "").split(",")) {
      parts.push({ kind: "cite", sourceId: sourceId.trim() });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

// Chip numbers, 1-based. Once the sources arrive they decide the numbers (and ids they do not
// list get no chip); while streaming, ids are numbered in order of first use, as the server does.
export function citationNumbers(
  text: string,
  sources: readonly ChatSource[] | null,
): Map<string, number> {
  const ids = sources
    ? sources.map((source) => source.sourceId)
    : [...text.matchAll(CITATION)].flatMap((match) =>
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
