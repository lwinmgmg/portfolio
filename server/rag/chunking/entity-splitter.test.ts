import { expect, test } from "bun:test";

import { sampleCv, sampleExtraction } from "@/server/cv/__fixtures__/sample-cv";
import { renderCvEntity } from "@/server/cv/cv-markdown";
import { sampleCvWith, thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { ChunkingError } from "@/server/rag/chunking/chunking-error";
import { outlineEntity, splitEntity } from "@/server/rag/chunking/entity-splitter";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";

const experienceKey = `experience:${sampleCv.experience[0].id}`;

function outlineOf(data: typeof sampleCv, entityKey: string) {
  return outlineEntity(entityKey, renderCvEntity(data, entityKey));
}

test("outlineEntity keeps the heading lines and titles the entity by its last heading", () => {
  const outline = outlineOf(sampleCv, experienceKey);

  expect(outline.heading).toBe("## Experience\n\n### Senior Software Engineer at Acme");
  expect(outline.title).toBe("Senior Software Engineer at Acme");
  expect(outlineOf(sampleCv, "profile").title).toBe("Jane Doe");
  expect(outlineOf(sampleCv, "profile").heading).toBe("# Jane Doe");
});

test("outlineEntity turns list blocks into labelled items", () => {
  const units = outlineOf(sampleCv, experienceKey).units;
  const highlights = units.filter((unit) => unit.listLabel === "Highlights:");

  expect(highlights.map((unit) => unit.text)).toEqual([
    "- Shipped the billing rewrite.",
    "- Cut p95 latency by 30%.",
  ]);
  expect(units.some((unit) => unit.text === "Leads the platform team." && !unit.listItem)).toBe(
    true,
  );
});

test("text without a heading line is a ChunkingError", () => {
  expect(thrownBy(() => outlineEntity("other:x", "Just text.")) instanceof ChunkingError).toBe(
    true,
  );
});

test("splitEntity returns the rendering unchanged when it fits", () => {
  const outline = outlineOf(sampleCv, experienceKey);
  expect(splitEntity(outline, 350)).toEqual([outline.text]);
});

test("splitEntity packs body units into parts that each repeat the heading", () => {
  const outline = outlineOf(sampleCv, experienceKey);
  const parts = splitEntity(outline, 60);

  expect(parts.length > 1).toBe(true);
  for (const part of parts) {
    expect(part.startsWith(`${outline.heading}\n\n`)).toBe(true);
    expect(estimateTokens(part)).toBeLessThanOrEqual(60);
  }
  // Every body unit lands in exactly one part, in order.
  const joined = parts.join("\n");
  let cursor = 0;
  for (const unit of outline.units) {
    const at = joined.indexOf(unit.text, cursor);
    expect(at >= cursor).toBe(true);
    cursor = at + unit.text.length;
  }
});

test("a list that continues in a new part repeats its label", () => {
  const data = sampleCvWith({
    experience: [
      {
        ...sampleExtraction.experience[0],
        highlights: Array.from({ length: 6 }, (_, n) => `Highlight ${n + 1} ${"x".repeat(60)}.`),
      },
    ],
  });
  const key = `experience:${data.experience[0].id}`;
  const parts = splitEntity(outlineOf(data, key), 60);
  const withHighlights = parts.filter((part) => part.includes("- Highlight"));

  expect(withHighlights.length > 1).toBe(true);
  for (const part of withHighlights) expect(part).toContain("Highlights:\n- Highlight");
});

test("a unit larger than a part is cut on word boundaries", () => {
  const summary = Array.from({ length: 120 }, (_, n) => `word${n}`).join(" ");
  const data = sampleCvWith({
    experience: [{ ...sampleExtraction.experience[0], summary }],
  });
  const key = `experience:${data.experience[0].id}`;
  const parts = splitEntity(outlineOf(data, key), 80);

  for (const part of parts) expect(estimateTokens(part)).toBeLessThanOrEqual(80);
  const words = parts.join(" ").split(/\s+/).filter((word) => /^word\d+$/.test(word));
  expect(words).toEqual(summary.split(" "));
});
