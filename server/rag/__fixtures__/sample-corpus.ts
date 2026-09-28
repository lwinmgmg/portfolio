import { sampleCv, sampleExtraction } from "@/server/cv/__fixtures__/sample-cv";
import { assignIds } from "@/server/cv/cv-ids";
import { renderCvMarkdown } from "@/server/cv/cv-markdown";
import type { CvData, CvExtraction } from "@/server/domain/cv";
import type { CorpusDocument } from "@/server/domain/rag";

export function corpusDocumentFor(data: CvData): CorpusDocument {
  return {
    sourceType: "cv",
    sourceId: "cv-1",
    title: `${data.profile.fullName} — ${data.profile.headline}`,
    markdown: renderCvMarkdown(data),
    data,
  };
}

// The sample CV with some sections replaced, with ids assigned like an extraction.
export function sampleCvWith(sections: Partial<CvExtraction>): CvData {
  return assignIds({ ...sampleExtraction, ...sections });
}

export const sampleCorpus = corpusDocumentFor(sampleCv);

// Sync counterpart of the service tests' `rejectionOf`.
export function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}
