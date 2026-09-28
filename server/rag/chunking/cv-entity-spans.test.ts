import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import { listEntityKeys, renderCvEntity, renderCvMarkdown } from "@/server/cv/cv-markdown";
import { sampleCvWith, thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { ChunkingError } from "@/server/rag/chunking/chunking-error";
import { entitySection, locateEntitySpans } from "@/server/rag/chunking/cv-entity-spans";

test("entitySection is the entity key prefix", () => {
  expect(entitySection("profile")).toBe("profile");
  expect(entitySection("experience:acme-senior")).toBe("experience");
  expect(entitySection("other:a:b")).toBe("other");
});

test("locateEntitySpans finds each entity rendering in document order", () => {
  const markdown = renderCvMarkdown(sampleCv);
  const spans = locateEntitySpans(sampleCv, markdown);

  expect(spans.map((span) => span.entityKey)).toEqual(listEntityKeys(sampleCv));
  for (const span of spans) {
    expect(markdown.slice(span.start, span.end)).toBe(renderCvEntity(sampleCv, span.entityKey));
  }
  spans.slice(1).forEach((span, index) => {
    expect(spans[index].end).toBeLessThan(span.start);
  });
});

test("identical renderings map to consecutive occurrences", () => {
  const volunteering = { title: "Volunteering", items: ["Mentor."] };
  const data = sampleCvWith({ otherSections: [volunteering, volunteering] });
  const [first, second] = locateEntitySpans(data, renderCvMarkdown(data)).slice(-2);

  expect(first.entityKey).not.toBe(second.entityKey);
  expect(first.end).toBeLessThan(second.start);
});

test("an entity missing from the markdown is a ChunkingError", () => {
  const markdown = renderCvMarkdown(sampleCv).replace("Cut p95 latency", "Cut latency");
  const error = thrownBy(() => locateEntitySpans(sampleCv, markdown));

  expect(error instanceof ChunkingError).toBe(true);
  if (error instanceof ChunkingError) expect(error.message).toContain("experience:");
});
