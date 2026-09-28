export const MIN_STEM_LENGTH = 3;

type SuffixRule = {
  suffix: string;
  replacement: string;
  // Extra condition on what is left after removing the suffix.
  appliesTo?: (stem: string) => boolean;
};

// Tried in order; the first rule that applies wins. `es` is only removed after a sibilant
// ("processes", "boxes", "matches"), so "databases" and "services" fall through to the `s` rule
// and meet their singular forms.
const SUFFIX_RULES: readonly SuffixRule[] = [
  { suffix: "ies", replacement: "y" },
  { suffix: "es", replacement: "", appliesTo: (stem) => /(?:ss|x|ch|sh)$/.test(stem) },
  { suffix: "s", replacement: "", appliesTo: (stem) => !stem.endsWith("s") && !stem.endsWith("u") },
  { suffix: "ing", replacement: "" },
  { suffix: "ed", replacement: "" },
];

// Names such as "node.js", "c++" and "c#" are matched literally.
const UNSTEMMED = /[.+#]/;

// A deliberately light suffix stripper: it only has to map a query and a document to the same
// term, not produce dictionary words. A stem shorter than MIN_STEM_LENGTH is never produced.
export function lightStem(term: string): string {
  if (UNSTEMMED.test(term)) return term;
  for (const rule of SUFFIX_RULES) {
    if (!term.endsWith(rule.suffix)) continue;
    const stem = term.slice(0, term.length - rule.suffix.length);
    if (stem.length < MIN_STEM_LENGTH) continue;
    if (rule.appliesTo && !rule.appliesTo(stem)) continue;
    return stem + rule.replacement;
  }
  return term;
}
