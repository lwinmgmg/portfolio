import { ChunkingError } from "@/server/rag/chunking/chunking-error";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";
import { packWords } from "@/server/rag/chunking/text-spans";

// A body piece that a split never cuts, unless the piece alone is larger than a part.
type Unit = {
  text: string;
  // Index of the body block the unit came from.
  block: number;
  // True for one `- item` line of a list block.
  listItem: boolean;
  // The list's label line (`Highlights:`). Repeated when the list starts or continues in a part.
  listLabel: string | null;
};

// A rendered CV entity (`renderCvEntity`) split into its heading lines and body units.
export type EntityOutline = {
  entityKey: string;
  text: string;
  // The leading heading blocks, e.g. `## Experience\n\n### Engineer at Acme`.
  heading: string;
  // The last heading without its `#` marks, e.g. `Engineer at Acme`.
  title: string;
  units: Unit[];
};

const HEADING_LINE = /^#{1,6} +(\S.*)$/;
const LIST_ITEM_PREFIX = "- ";

function headingTitle(block: string): string | null {
  const match = HEADING_LINE.exec(block);
  return match === null ? null : match[1].trim();
}

function isListItem(line: string): boolean {
  return line.startsWith(LIST_ITEM_PREFIX);
}

function blockUnits(block: string, index: number): Unit[] {
  const lines = block.split("\n");
  if (lines.every(isListItem)) {
    return lines.map((text) => ({ text, block: index, listItem: true, listLabel: null }));
  }
  const [label, ...items] = lines;
  if (items.length > 0 && label.endsWith(":") && items.every(isListItem)) {
    return items.map((text) => ({ text, block: index, listItem: true, listLabel: label }));
  }
  return [{ text: block, block: index, listItem: false, listLabel: null }];
}

export function outlineEntity(entityKey: string, text: string): EntityOutline {
  const blocks = text.split("\n\n").filter((block) => block.trim().length > 0);
  const titles: string[] = [];
  for (const block of blocks) {
    const title = headingTitle(block);
    if (title === null) break;
    titles.push(title);
  }
  if (titles.length === 0) {
    throw new ChunkingError(`CV entity "${entityKey}" has no heading line.`);
  }
  return {
    entityKey,
    text,
    heading: blocks.slice(0, titles.length).join("\n\n"),
    title: titles[titles.length - 1],
    units: blocks.slice(titles.length).flatMap((block, index) => blockUnits(block, index)),
  };
}

// Items of one list stay on consecutive lines; everything else is separated by a blank line.
function renderPart(heading: string, units: readonly Unit[]): string {
  let text = heading;
  units.forEach((unit, index) => {
    const previous = index > 0 ? units[index - 1] : null;
    if (previous !== null && previous.listItem && unit.listItem && previous.block === unit.block) {
      text += `\n${unit.text}`;
    } else {
      text += `\n\n${unit.listLabel === null ? "" : `${unit.listLabel}\n`}${unit.text}`;
    }
  });
  return text;
}

// Returns the entity text unchanged when it fits in `maxTokens`. Otherwise packs the body units
// in order into parts of at most `maxTokens`, each starting with the entity heading. A unit
// larger than a part on its own is cut on word boundaries first.
export function splitEntity(entity: EntityOutline, maxTokens: number): string[] {
  if (estimateTokens(entity.text) <= maxTokens || entity.units.length === 0) return [entity.text];

  const fits = (units: readonly Unit[]) =>
    estimateTokens(renderPart(entity.heading, units)) <= maxTokens;
  const units = entity.units.flatMap((unit) =>
    fits([unit])
      ? [unit]
      : packWords(unit.text, (slice) => fits([{ ...unit, text: slice }])).map((text) => ({
          ...unit,
          text,
        })),
  );

  const parts: string[] = [];
  let current: Unit[] = [];
  for (const unit of units) {
    if (current.length > 0 && !fits([...current, unit])) {
      parts.push(renderPart(entity.heading, current));
      current = [];
    }
    current.push(unit);
  }
  parts.push(renderPart(entity.heading, current));
  return parts;
}
