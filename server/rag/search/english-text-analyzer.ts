import type { TextAnalyzer } from "@/server/domain/rag";
import { lightStem } from "@/server/rag/search/light-stemmer";
import { ENGLISH_STOPWORDS } from "@/server/rag/search/stopwords";

// Keeps "c++", "c#", "node.js", "next.js" and "asp.net" as single tokens.
const TOKEN_PATTERN = /[a-z0-9]+(?:[.+#][a-z0-9+#]+)*[+#]*/g;
const HAS_ALPHANUMERIC = /[a-z0-9]/;

// NFKC + lowercase, tokenize, drop stopwords, light-stem. A dotted token is also emitted as its
// parts, so "node.js" matches a query for "node" as well as "node.js".
export class EnglishTextAnalyzer implements TextAnalyzer {
  analyze(text: string): string[] {
    const terms: string[] = [];
    for (const [token] of text.normalize("NFKC").toLowerCase().matchAll(TOKEN_PATTERN)) {
      this.emit(token, terms);
      if (!token.includes(".")) continue;
      for (const part of token.split(".")) {
        if (HAS_ALPHANUMERIC.test(part)) this.emit(part, terms);
      }
    }
    return terms;
  }

  private emit(token: string, terms: string[]): void {
    if (!ENGLISH_STOPWORDS.has(token)) terms.push(lightStem(token));
  }
}
