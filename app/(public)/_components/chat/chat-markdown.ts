import { mailtoHref, safeWebUrl } from "@/app/(public)/_components/cv/cv-format";

// The Markdown subset chat answers use, parsed into a tree that React renders as elements.
// Nothing is ever turned into HTML, so the model's output cannot inject markup.
//   Blocks: paragraphs, #-headings, `-` / `*` / `+` and `1.` lists (nested by indentation),
//           ``` code fences, --- rules.
//   Inline: **strong**, *em*, `code`, [links](https://…), \escapes, and [S#] citations.
// Anything else (tables, HTML, images) stays as the text the model wrote.

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: InlineNode[] }
  | { kind: "em"; children: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: InlineNode[] }
  | { kind: "cite"; sourceId: string };

export type ListItem = { content: InlineNode[]; lists: ListBlock[] };

export type ListBlock = { kind: "list"; ordered: boolean; start: number; items: ListItem[] };

export type AnswerBlock =
  | { kind: "paragraph"; content: InlineNode[] }
  | { kind: "heading"; content: InlineNode[] }
  | ListBlock
  | { kind: "code"; text: string }
  | { kind: "rule" };

// `[S1]` and `[S1, S2]`, with the spaces before them, as the server's citation parser reads them.
export const CITATION_SOURCE = String.raw`[ \t]*\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]`;
// A marker the stream has not finished yet, e.g. "[S" or "[S1, S2" at the very end.
const PENDING_CITATION = /[ \t]*\[\s*(?:S\d*(?:\s*,\s*(?:S\d*)?)*)?$/;

const FENCE = /^\s*```/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:[ \t]*\1){2,}\s*$/;
const LIST_ITEM = /^([ \t]*)(?:[-*+•]|(\d{1,9})[.)])\s+(.*)$/;
// Indentation that opens a nested list, relative to its parent list.
const NEST_INDENT = 2;

type RawItem = { text: string; lists: RawList[] };
type RawList = { ordered: boolean; start: number; items: RawItem[] };
type RawBlock =
  | { kind: "paragraph" | "heading" | "code"; text: string }
  | { kind: "list"; list: RawList }
  | { kind: "rule" };

export function parseAnswer(text: string, streaming: boolean): AnswerBlock[] {
  const visible = streaming ? text.replace(PENDING_CITATION, "") : text;
  const blocks: RawBlock[] = [];
  let paragraph: string[] = [];
  // Open lists, outermost first, with the indentation of their items.
  let lists: { indent: number; list: RawList }[] = [];
  let code: string[] | null = null;

  const closeParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const closeAll = () => {
    closeParagraph();
    lists = [];
  };

  const addItem = (indent: number, number: string | undefined, text: string) => {
    while (lists.length > 0 && indent < (lists.at(-1)?.indent ?? 0)) lists.pop();
    const open = lists.at(-1);
    const item: RawItem = { text, lists: [] };
    if (open && indent < open.indent + NEST_INDENT) {
      open.list.items.push(item);
      return;
    }
    const list: RawList = {
      ordered: number !== undefined,
      start: number === undefined ? 1 : Number(number),
      items: [item],
    };
    const parent = open?.list.items.at(-1);
    if (parent) parent.lists.push(list);
    else blocks.push({ kind: "list", list });
    lists.push({ indent, list });
  };

  for (const line of visible.split("\n")) {
    if (code) {
      if (FENCE.test(line)) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (FENCE.test(line)) {
      closeAll();
      code = [];
      continue;
    }
    if (!line.trim()) {
      closeAll();
      continue;
    }
    if (RULE.test(line)) {
      closeAll();
      blocks.push({ kind: "rule" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      closeAll();
      blocks.push({ kind: "heading", text: heading[1] ?? "" });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      closeParagraph();
      addItem(indentWidth(item[1] ?? ""), item[2], item[3] ?? "");
      continue;
    }
    const openItem = lists.at(-1)?.list.items.at(-1);
    if (openItem) {
      // A line under a list item continues it.
      openItem.text += ` ${line.trim()}`;
    } else {
      paragraph.push(line.trim());
    }
  }
  // A fence the stream has not closed yet.
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  closeParagraph();
  return blocks.map(toBlock);
}

function indentWidth(indent: string): number {
  return indent.replace(/\t/g, "    ").length;
}

function toBlock(block: RawBlock): AnswerBlock {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return { kind: block.kind, content: parseInline(block.text) };
    case "code":
      return { kind: "code", text: block.text };
    case "list":
      return toList(block.list);
    case "rule":
      return { kind: "rule" };
  }
}

function toList(list: RawList): ListBlock {
  return {
    kind: "list",
    ordered: list.ordered,
    start: list.start,
    items: list.items.map((item) => ({
      content: parseInline(item.text),
      lists: item.lists.map(toList),
    })),
  };
}

const ESCAPABLE = /[\\`*_[\]()#+\-.!>~|]/;
const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)/y;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const citation = new RegExp(CITATION_SOURCE, "y");
  let plain = "";
  const flush = () => {
    if (plain) nodes.push({ kind: "text", text: plain });
    plain = "";
  };

  let i = 0;
  while (i < text.length) {
    const char = text.charAt(i);

    if (char === "\\" && ESCAPABLE.test(text.charAt(i + 1))) {
      plain += text.charAt(i + 1);
      i += 2;
      continue;
    }

    citation.lastIndex = i;
    const cite = citation.exec(text);
    if (cite) {
      flush();
      for (const id of (cite[1] ?? "").split(",")) nodes.push({ kind: "cite", sourceId: id.trim() });
      i = citation.lastIndex;
      continue;
    }

    if (char === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (char === "[") {
      LINK.lastIndex = i;
      const link = LINK.exec(text);
      if (link) {
        flush();
        const children = parseInline(link[1] ?? "");
        const href = linkHref(link[2] ?? "");
        if (href) nodes.push({ kind: "link", href, children });
        else nodes.push(...children);
        i = LINK.lastIndex;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const double = text.charAt(i + 1) === char;
      const delimiter = double ? char + char : char;
      const end = closingDelimiter(text, i, delimiter);
      if (end !== null) {
        flush();
        const children = parseInline(text.slice(i + delimiter.length, end));
        nodes.push({ kind: double ? "strong" : "em", children });
        i = end + delimiter.length;
        continue;
      }
    }

    plain += char;
    i += 1;
  }
  flush();
  return nodes;
}

// Where the emphasis opened at `start` closes, or null when it does not (then it is literal).
// Openers are followed, and closers preceded, by non-space. `_` never opens or closes inside a
// word, so snake_case stays as written.
function closingDelimiter(text: string, start: number, delimiter: string): number | null {
  const char = delimiter.charAt(0);
  const after = start + delimiter.length;
  if (after >= text.length || /\s/.test(text.charAt(after))) return null;
  if (char === "_" && isWordChar(text.charAt(start - 1))) return null;

  for (let end = text.indexOf(delimiter, after + 1); end !== -1; end = text.indexOf(delimiter, end + 1)) {
    const before = text.charAt(end - 1);
    const next = text.charAt(end + delimiter.length);
    if (/\s/.test(before) || before === "\\") continue;
    // A single delimiter must not be half of a double one (`*a **b** c*`).
    if (delimiter.length === 1 && (next === char || before === char)) continue;
    if (char === "_" && isWordChar(next)) continue;
    // In `***it***` strong closes on the last two of the run, leaving `*it*` inside.
    if (delimiter.length === 2 && next === char) return end + 1;
    return end;
  }
  return null;
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

function linkHref(url: string): string | null {
  if (url.toLowerCase().startsWith("mailto:")) return mailtoHref(url.slice("mailto:".length));
  return safeWebUrl(url);
}
