// Half-open character range `[start, end)` inside a text.
export type TextSpan = { start: number; end: number };

export function spansOverlap(a: TextSpan, b: TextSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

// Every run of non-whitespace characters, in order.
export function wordSpans(text: string): TextSpan[] {
  return Array.from(text.matchAll(/\S+/g), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

// Splits `text` on word boundaries into the longest consecutive slices that `fits` accepts.
// Slices keep the original whitespace between their words. A single word that does not fit
// becomes a slice of its own, because a word is never cut.
export function packWords(text: string, fits: (slice: string) => boolean): string[] {
  const words = wordSpans(text);
  const slices: string[] = [];
  let first = 0;
  while (first < words.length) {
    let last = first;
    while (
      last + 1 < words.length &&
      fits(text.slice(words[first].start, words[last + 1].end))
    ) {
      last += 1;
    }
    slices.push(text.slice(words[first].start, words[last].end));
    first = last + 1;
  }
  return slices;
}
