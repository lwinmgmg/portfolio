import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import { listEntityKeys, renderCvEntity } from "@/server/cv/cv-markdown";
import { corpusDocumentFor, sampleCorpus, thrownBy } from "@/server/rag/__fixtures__/sample-corpus";
import { ChunkingError } from "@/server/rag/chunking/chunking-error";
import { entitySection } from "@/server/rag/chunking/cv-entity-spans";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";
import { wordSpans, type TextSpan } from "@/server/rag/chunking/text-spans";
import { TokenWindowChunker } from "@/server/rag/chunking/token-window-chunker";

const markdown = sampleCorpus.markdown;
const small = { windowTokens: 30, overlapTokens: 8 };

// Where each window sits in the markdown. Windows move forward, so search after the last start.
function windowSpans(texts: readonly string[]): TextSpan[] {
  let from = 0;
  return texts.map((text) => {
    const start = markdown.indexOf(text, from);
    expect(start >= from).toBe(true);
    from = start + 1;
    return { start, end: start + text.length };
  });
}

function chunkTexts(options = small): string[] {
  return new TokenWindowChunker(options).chunk(sampleCorpus).map((chunk) => chunk.text);
}

test("default windows cover the fixture within 200 tokens each", () => {
  const chunks = new TokenWindowChunker().chunk(sampleCorpus);

  expect(chunks.length).toBe(2);
  chunks.forEach((chunk, index) => {
    expect(chunk.ordinal).toBe(index);
    expect(chunk.title).toBe(`Window ${index + 1}`);
    expect(chunk.tokenCount).toBe(estimateTokens(chunk.text));
    expect(chunk.tokenCount).toBeLessThanOrEqual(200);
    expect(markdown).toContain(chunk.text);
  });
});

test("windows start and end on word boundaries and keep the markdown between words", () => {
  const words = wordSpans(markdown);
  const starts = new Set(words.map((word) => word.start));
  const ends = new Set(words.map((word) => word.end));
  for (const span of windowSpans(chunkTexts())) {
    expect(starts.has(span.start)).toBe(true);
    expect(ends.has(span.end)).toBe(true);
  }
});

test("consecutive windows share a tail of at most overlapTokens", () => {
  const spans = windowSpans(chunkTexts());
  expect(spans.length > 3).toBe(true);

  spans.slice(1).forEach((span, index) => {
    const previous = spans[index];
    expect(previous.start).toBeLessThan(span.start);
    expect(span.start).toBeLessThan(previous.end);
    const shared = markdown.slice(span.start, previous.end);
    expect(estimateTokens(shared)).toBeLessThanOrEqual(small.overlapTokens);
  });
});

test("without overlap, windows tile the words exactly once", () => {
  const spans = windowSpans(chunkTexts({ windowTokens: 30, overlapTokens: 0 }));
  spans.slice(1).forEach((span, index) => {
    expect(spans[index].end).toBeLessThan(span.start);
  });
});

test("every word lies inside some window", () => {
  const spans = windowSpans(chunkTexts());
  for (const word of wordSpans(markdown)) {
    expect(spans.some((span) => span.start <= word.start && word.end <= span.end)).toBe(true);
  }
});

test("every window lists the entities it overlaps, and its section is the first one's", () => {
  const chunks = new TokenWindowChunker(small).chunk(sampleCorpus);
  const keys = listEntityKeys(sampleCv);

  for (const chunk of chunks) {
    expect(chunk.entityKeys.length > 0).toBe(true);
    expect(chunk.section).toBe(entitySection(chunk.entityKeys[0]));
    // Keys come in document order.
    const positions = chunk.entityKeys.map((key) => keys.indexOf(key));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  }
  expect(chunks[0].entityKeys).toEqual(["profile"]);
  const all = new Set(chunks.flatMap((chunk) => chunk.entityKeys));
  expect([...all]).toEqual(keys);
});

test("a window that spans an entity boundary names both entities", () => {
  const experienceKey = `experience:${sampleCv.experience[0].id}`;
  const projectKey = `project:${sampleCv.projects[0].id}`;
  const experienceTail = renderCvEntity(sampleCv, experienceKey).slice(-20);
  const chunks = new TokenWindowChunker(small).chunk(sampleCorpus);
  const straddling = chunks.find(
    (chunk) => chunk.text.includes("TypeScript, MongoDB") && chunk.text.includes("## Projects"),
  );

  expect(experienceTail).toContain("MongoDB");
  expect(straddling?.entityKeys).toEqual([experienceKey, projectKey]);
});

test("chunking is deterministic", () => {
  const chunker = new TokenWindowChunker(small);
  expect(chunker.chunk(sampleCorpus)).toEqual(chunker.chunk(corpusDocumentFor(sampleCv)));
});

test("markdown that does not match the CV data is a ChunkingError", () => {
  const doc = { ...sampleCorpus, markdown: "# Someone else\n" };
  expect(thrownBy(() => new TokenWindowChunker().chunk(doc)) instanceof ChunkingError).toBe(true);
});

test("invalid options are rejected", () => {
  for (const options of [
    { windowTokens: 0 },
    { windowTokens: 40, overlapTokens: 40 },
    { overlapTokens: -1 },
    { windowTokens: 12.5 },
  ]) {
    expect(thrownBy(() => new TokenWindowChunker(options)) instanceof RangeError).toBe(true);
  }
});
