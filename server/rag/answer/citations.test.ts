import { expect, test } from "bun:test";

import {
  citedEntityKeys,
  extractCitations,
  stripCitations,
  type CitableChunk,
} from "@/server/rag/answer/citations";

const chunks: CitableChunk[] = [
  { sourceId: "S1", entityKeys: ["experience:acme"], title: "Engineer", section: "experience" },
  {
    sourceId: "S2",
    entityKeys: ["project:portfolio", "skills:languages"],
    title: "Portfolio",
    section: "project",
  },
  { sourceId: "S3", entityKeys: ["profile"], title: "Jane Doe", section: "profile" },
  { sourceId: "S4", entityKeys: ["unknown:x"], title: "Odd", section: "unknown" },
];

test("extractCitations returns each cited source once, in order of first use", () => {
  const sources = extractCitations("She led it [S2]. Before that, Acme [S1][S2]. [S3]", chunks);

  expect(sources.map((source) => source.sourceId)).toEqual(["S2", "S1", "S3"]);
});

test("extractCitations maps the first entity key to its CV anchor", () => {
  const sources = extractCitations("[S2] [S3] [S1]", chunks);

  expect(sources).toEqual([
    {
      sourceId: "S2",
      entityKeys: ["project:portfolio", "skills:languages"],
      title: "Portfolio",
      section: "project",
      anchor: "#projects-portfolio",
    },
    {
      sourceId: "S3",
      entityKeys: ["profile"],
      title: "Jane Doe",
      section: "profile",
      anchor: "#profile",
    },
    {
      sourceId: "S1",
      entityKeys: ["experience:acme"],
      title: "Engineer",
      section: "experience",
      anchor: "#experience-acme",
    },
  ]);
});

test("extractCitations reads grouped markers and ignores unknown ids", () => {
  const sources = extractCitations("Both [S1, S9 , S3]. Also [S7] and [s1].", chunks);

  expect(sources.map((source) => source.sourceId)).toEqual(["S1", "S3"]);
});

test("a source whose entity key has no anchor has a null anchor", () => {
  expect(extractCitations("[S4]", chunks)[0]?.anchor).toBeNull();
});

test("an answer without markers cites nothing", () => {
  expect(extractCitations("I don't have that information.", chunks)).toEqual([]);
});

test("citedEntityKeys flattens the cited sources without duplicates", () => {
  const sources = extractCitations("[S2] [S1] [S2]", [
    ...chunks.slice(0, 1),
    { ...chunks[1], entityKeys: ["project:portfolio", "experience:acme"] } as CitableChunk,
  ]);

  expect(citedEntityKeys(sources)).toEqual(["project:portfolio", "experience:acme"]);
});

test("stripCitations removes markers and the spaces before them", () => {
  expect(stripCitations("Worked at Acme [S1]. Led it [S1][S2].\n- Go [S3, S4]")).toBe(
    "Worked at Acme. Led it.\n- Go",
  );
});
