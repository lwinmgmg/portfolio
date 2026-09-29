const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;

// Removes every mention of `name` from text sent to the reranker. The name is matched as a phrase
// (its words in order, any case, any whitespace between them) with an optional possessive, never
// word by word, so a first name that is also a common word stays in the sentence. The spaces the
// name leaves behind are tidied. A text that would become empty is returned as it was.
export function withoutName(text: string, name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return text;

  const phrase = words.map(escapeRegExp).join(String.raw`\s+`);
  const pattern = new RegExp(`(?<!${WORD_CHAR})${phrase}(?:['’]s?)?(?!${WORD_CHAR})`, "giu");
  if (text.search(pattern) === -1) return text;

  const removed = tidy(text.replace(pattern, ""));
  return removed === "" ? text : removed;
}

// Keeps newlines, so a chunk's context stays apart from its text.
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ([,.;:!?)\]])/g, "$1")
    .replace(/^ | $/gm, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
