import type { Contextualizer, CorpusDocument } from "@/server/domain/rag";

// For indexes built without contextual retrieval: every chunk is indexed as-is.
export class NoopContextualizer implements Contextualizer {
  contextualize(_doc: CorpusDocument, texts: string[]): Promise<(string | null)[]> {
    return Promise.resolve(texts.map(() => null));
  }
}
