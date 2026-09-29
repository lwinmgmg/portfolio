import type { LexicalSearchOptions, RankedHit, TextAnalyzer } from "@/server/domain/rag";
import { assertTopK, topRankedHits, type ScoredChunk } from "@/server/rag/search/ranked-hits";

export type Bm25Document = { id: string; text: string };

export type Bm25Options = {
  k1?: number;
  b?: number;
};

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

type Posting = { doc: number; tf: number };

// Okapi BM25 over analyzed terms, with the always-positive idf ln(1 + (N - df + 0.5) / (df + 0.5)).
export class Bm25Index {
  private readonly ids: string[];
  private readonly lengths: number[];
  private readonly averageLength: number;
  private readonly postings = new Map<string, Posting[]>();
  private readonly k1: number;
  private readonly b: number;

  constructor(
    docs: readonly Bm25Document[],
    private readonly analyzer: TextAnalyzer,
    options: Bm25Options = {},
  ) {
    this.k1 = options.k1 ?? BM25_K1;
    this.b = options.b ?? BM25_B;
    if (!Number.isFinite(this.k1) || this.k1 < 0) {
      throw new RangeError("k1 must be a non-negative number.");
    }
    if (!Number.isFinite(this.b) || this.b < 0 || this.b > 1) {
      throw new RangeError("b must be a number from 0 to 1.");
    }

    this.ids = docs.map((doc) => doc.id);
    this.lengths = docs.map((doc, index) => this.addDocument(index, doc.text));
    const totalLength = this.lengths.reduce((sum, length) => sum + length, 0);
    this.averageLength = docs.length === 0 ? 0 : totalLength / docs.length;
  }

  get size(): number {
    return this.ids.length;
  }

  // Query terms are deduplicated. Documents that match no term are left out.
  search(query: string, k: number, options: LexicalSearchOptions = {}): RankedHit[] {
    assertTopK(k);
    const ignored = new Set(this.analyzer.analyze(options.ignoreTermsOf ?? ""));
    const scores = new Array<number>(this.ids.length).fill(0);
    for (const term of new Set(this.analyzer.analyze(query))) {
      if (ignored.has(term)) continue;
      const postings = this.postings.get(term);
      if (!postings) continue;
      const idf = this.idf(postings.length);
      for (const { doc, tf } of postings) {
        scores[doc] += idf * this.termWeight(tf, this.lengths[doc]);
      }
    }

    const scored: ScoredChunk[] = [];
    scores.forEach((score, doc) => {
      if (score > 0) scored.push({ chunkId: this.ids[doc], score });
    });
    return topRankedHits(scored, k);
  }

  private addDocument(doc: number, text: string): number {
    const terms = this.analyzer.analyze(text);
    const frequencies = new Map<string, number>();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    for (const [term, tf] of frequencies) {
      const postings = this.postings.get(term);
      if (postings) postings.push({ doc, tf });
      else this.postings.set(term, [{ doc, tf }]);
    }
    return terms.length;
  }

  private idf(documentFrequency: number): number {
    const n = this.ids.length;
    return Math.log(1 + (n - documentFrequency + 0.5) / (documentFrequency + 0.5));
  }

  // Only called for documents that contain the term, so the average length is positive.
  private termWeight(tf: number, length: number): number {
    const lengthNorm = 1 - this.b + (this.b * length) / this.averageLength;
    return (tf * (this.k1 + 1)) / (tf + this.k1 * lengthNorm);
  }
}
