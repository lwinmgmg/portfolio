import type { ChunkDraft, Chunker, CorpusDocument } from "@/server/domain/rag";
import { ChunkingError } from "@/server/rag/chunking/chunking-error";
import { entitySection, locateEntitySpans } from "@/server/rag/chunking/cv-entity-spans";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";
import { spansOverlap, wordSpans, type TextSpan } from "@/server/rag/chunking/text-spans";

export type TokenWindowChunkerOptions = {
  windowTokens?: number;
  overlapTokens?: number;
};

export const TOKEN_WINDOW_TOKENS = 200;
export const TOKEN_WINDOW_OVERLAP_TOKENS = 40;

// Structure-blind baseline: fixed-size windows over the canonical markdown, compared against
// the structured chunker in evals. Entity keys are recovered from where each window falls.
export class TokenWindowChunker implements Chunker {
  private readonly windowTokens: number;
  private readonly overlapTokens: number;

  constructor(options: TokenWindowChunkerOptions = {}) {
    this.windowTokens = options.windowTokens ?? TOKEN_WINDOW_TOKENS;
    this.overlapTokens = options.overlapTokens ?? TOKEN_WINDOW_OVERLAP_TOKENS;
    if (!Number.isInteger(this.windowTokens) || this.windowTokens < 1) {
      throw new RangeError("windowTokens must be a positive integer.");
    }
    if (
      !Number.isInteger(this.overlapTokens) ||
      this.overlapTokens < 0 ||
      this.overlapTokens >= this.windowTokens
    ) {
      throw new RangeError("overlapTokens must be an integer from 0 to windowTokens - 1.");
    }
  }

  chunk(doc: CorpusDocument): ChunkDraft[] {
    const entities = locateEntitySpans(doc.data, doc.markdown);

    return this.windows(doc.markdown).map((window, ordinal) => {
      const overlapping = entities.filter((entity) => spansOverlap(entity, window));
      if (overlapping.length === 0) {
        throw new ChunkingError(`Window ${ordinal + 1} does not overlap any CV entity.`);
      }
      const text = doc.markdown.slice(window.start, window.end);
      return {
        ordinal,
        section: entitySection(overlapping[0].entityKey),
        title: `Window ${ordinal + 1}`,
        entityKeys: overlapping.map((entity) => entity.entityKey),
        text,
        tokenCount: estimateTokens(text),
      };
    });
  }

  // Each window holds as many whole words as fit in `windowTokens` (at least one). The next
  // window starts at the earliest word that keeps the shared tail within `overlapTokens`, and
  // always after the previous window's first word, so the slide makes progress.
  private windows(markdown: string): TextSpan[] {
    const words = wordSpans(markdown);
    const tokensBetween = (first: number, last: number) =>
      estimateTokens(markdown.slice(words[first].start, words[last].end));

    const windows: TextSpan[] = [];
    let first = 0;
    while (first < words.length) {
      let last = first;
      while (last + 1 < words.length && tokensBetween(first, last + 1) <= this.windowTokens) {
        last += 1;
      }
      windows.push({ start: words[first].start, end: words[last].end });
      if (last === words.length - 1) break;

      let next = last + 1;
      while (next - 1 > first && tokensBetween(next - 1, last) <= this.overlapTokens) {
        next -= 1;
      }
      first = next;
    }
    return windows;
  }
}
