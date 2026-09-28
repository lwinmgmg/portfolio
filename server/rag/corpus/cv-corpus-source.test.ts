import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import { renderCvMarkdown } from "@/server/cv/cv-markdown";
import type { CvVersion } from "@/server/domain/cv";
import { CvCorpusSource, cvCorpusTitle } from "@/server/rag/corpus/cv-corpus-source";

const at = "2026-09-28T00:00:00.000Z";

function published(data: CvVersion["data"]): CvVersion {
  return {
    id: "cv-7",
    status: "published",
    pdf: {
      pathname: "cv/resume.pdf",
      filename: "resume.pdf",
      size: 1,
      contentType: "application/pdf",
      uploadedAt: at,
    },
    extraction: { status: "succeeded", model: "m", error: null, startedAt: at, finishedAt: at },
    data,
    createdAt: at,
    updatedAt: at,
    publishedAt: at,
  };
}

function sourceFor(version: CvVersion | null) {
  return new CvCorpusSource({ findPublished: async () => version });
}

test("the published CV becomes the corpus document", async () => {
  expect(await sourceFor(published(sampleCv)).load()).toEqual({
    sourceType: "cv",
    sourceId: "cv-7",
    title: "Jane Doe — Senior Software Engineer",
    markdown: renderCvMarkdown(sampleCv),
    data: sampleCv,
  });
});

test("load returns null when nothing is published or the version has no data", async () => {
  expect(await sourceFor(null).load()).toBeNull();
  expect(await sourceFor(published(null)).load()).toBeNull();
});

test("cvCorpusTitle falls back to the name without a headline", () => {
  expect(cvCorpusTitle({ ...sampleCv.profile, headline: "  " })).toBe("Jane Doe");
});
