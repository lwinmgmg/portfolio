import { expect, test } from "bun:test";

import { sampleCv, sampleExtraction } from "@/server/cv/__fixtures__/sample-cv";
import { listEntityKeys, renderCvEntity } from "@/server/cv/cv-markdown";
import {
  corpusDocumentFor,
  sampleCorpus,
  sampleCvWith,
  thrownBy,
} from "@/server/rag/__fixtures__/sample-corpus";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";
import {
  STRUCTURED_MAX_ENTITY_TOKENS,
  STRUCTURED_MERGE_SKILLS_MAX_TOKENS,
  StructuredCvChunker,
} from "@/server/rag/chunking/structured-cv-chunker";

test("the fixture becomes one chunk per entity, rendered exactly", () => {
  const chunks = new StructuredCvChunker().chunk(sampleCorpus);
  const keys = listEntityKeys(sampleCv);

  expect(chunks.map((chunk) => chunk.entityKeys)).toEqual(keys.map((key) => [key]));
  expect(chunks.map((chunk) => chunk.ordinal)).toEqual(keys.map((_, index) => index));
  for (const chunk of chunks) {
    expect(chunk.text).toBe(renderCvEntity(sampleCv, chunk.entityKeys[0]));
    expect(chunk.tokenCount).toBe(estimateTokens(chunk.text));
  }
  expect(chunks.map((chunk) => [chunk.section, chunk.title])).toEqual([
    ["profile", "Jane Doe"],
    ["experience", "Senior Software Engineer at Acme"],
    ["project", "Portfolio"],
    ["education", "B.Sc. Computer Science, TU Berlin"],
    ["skills", "Languages"],
    ["certification", "AWS Certified Developer"],
    ["language", "English"],
    ["other", "Volunteering"],
  ]);
});

test("chunking is deterministic", () => {
  const chunker = new StructuredCvChunker();
  expect(chunker.chunk(sampleCorpus)).toEqual(chunker.chunk(corpusDocumentFor(sampleCv)));
});

test("an entity over 350 tokens is split into parts that keep its heading and key", () => {
  const highlights = Array.from(
    { length: 16 },
    (_, n) => `Highlight ${n + 1}: ${"delivered measurable platform improvements ".repeat(3)}`,
  );
  const data = sampleCvWith({
    experience: [{ ...sampleExtraction.experience[0], highlights }],
  });
  const key = `experience:${data.experience[0].id}`;
  expect(estimateTokens(renderCvEntity(data, key)) > STRUCTURED_MAX_ENTITY_TOKENS).toBe(true);

  const chunks = new StructuredCvChunker().chunk(corpusDocumentFor(data));
  const parts = chunks.filter((chunk) => chunk.entityKeys.includes(key));

  expect(parts.length > 1).toBe(true);
  for (const part of parts) {
    expect(part.entityKeys).toEqual([key]);
    expect(part.section).toBe("experience");
    expect(part.title).toBe("Senior Software Engineer at Acme");
    expect(part.text.startsWith("## Experience\n\n### Senior Software Engineer at Acme\n\n")).toBe(
      true,
    );
    expect(part.tokenCount).toBeLessThanOrEqual(STRUCTURED_MAX_ENTITY_TOKENS);
  }
  const partsText = parts.map((part) => part.text).join("\n");
  for (const highlight of highlights) expect(partsText).toContain(`- ${highlight}`);
  // Parts sit together, and ordinals stay consecutive across the whole CV.
  expect(chunks.map((chunk) => chunk.ordinal)).toEqual(chunks.map((_, index) => index));
  expect(parts.map((part) => part.ordinal)).toEqual(
    parts.map((_, index) => (parts[0]?.ordinal ?? 0) + index),
  );
});

const smallSkills = [
  { category: "Languages", items: ["TypeScript", "Go"] },
  { category: "Data", items: ["MongoDB", "PostgreSQL"] },
  { category: "Cloud", items: ["Vercel", "AWS"] },
];

test("small skill groups merge into one chunk in place of the first group", () => {
  const data = sampleCvWith({ skills: smallSkills });
  const doc = corpusDocumentFor(data);
  const chunks = new StructuredCvChunker().chunk(doc);
  const skillKeys = data.skills.map((group) => `skills:${group.id}`);
  const skills = chunks.filter((chunk) => chunk.section === "skills");

  expect(skills.length).toBe(1);
  expect(skills[0].entityKeys).toEqual(skillKeys);
  expect(skills[0].title).toBe("Skills");
  expect(skills[0].text).toBe(skillKeys.map((key) => renderCvEntity(data, key)).join("\n\n"));
  expect(doc.markdown).toContain(skills[0].text);
  expect(chunks.map((chunk) => chunk.section)).toEqual([
    "profile",
    "experience",
    "project",
    "education",
    "skills",
    "certification",
    "language",
    "other",
  ]);
});

test("skill groups stay separate above 200 tokens or with merging off", () => {
  const bigSkills = smallSkills.map((group) => ({
    ...group,
    items: Array.from({ length: 20 }, (_, n) => `${group.category} tool ${n + 1}`),
  }));
  const bigData = sampleCvWith({ skills: bigSkills });
  const bigText = bigData.skills.map((group) => renderCvEntity(bigData, `skills:${group.id}`));
  expect(estimateTokens(bigText.join("\n\n")) > STRUCTURED_MERGE_SKILLS_MAX_TOKENS).toBe(true);

  const big = new StructuredCvChunker().chunk(corpusDocumentFor(bigData));
  const unmerged = new StructuredCvChunker({ mergeSkillsMaxTokens: null }).chunk(
    corpusDocumentFor(sampleCvWith({ skills: smallSkills })),
  );

  for (const chunks of [big, unmerged]) {
    const skills = chunks.filter((chunk) => chunk.section === "skills");
    expect(skills.map((chunk) => chunk.title)).toEqual(["Languages", "Data", "Cloud"]);
    for (const chunk of skills) expect(chunk.entityKeys.length).toBe(1);
  }
});

test("invalid options are rejected", () => {
  expect(thrownBy(() => new StructuredCvChunker({ maxEntityTokens: 0 })) instanceof RangeError).toBe(
    true,
  );
  expect(
    thrownBy(() => new StructuredCvChunker({ mergeSkillsMaxTokens: 1.5 })) instanceof RangeError,
  ).toBe(true);
});
