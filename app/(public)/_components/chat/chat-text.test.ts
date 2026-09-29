import { expect, test } from "bun:test";

import {
  citationNumbers,
  parseAnswer,
  sourceSectionLabel,
} from "@/app/(public)/_components/chat/chat-text";
import type { ChatSource } from "@/server/domain/chat";

function source(sourceId: string): ChatSource {
  return { sourceId, entityKeys: [], title: sourceId, section: "experience", anchor: null };
}

test("splits paragraphs on blank lines and keeps single line breaks", () => {
  expect(parseAnswer("First line\nsecond line\n\nNext paragraph", false)).toEqual([
    { kind: "paragraph", parts: [{ kind: "text", text: "First line\nsecond line" }] },
    { kind: "paragraph", parts: [{ kind: "text", text: "Next paragraph" }] },
  ]);
});

test("reads '-' lists, including a list right after a paragraph and wrapped items", () => {
  expect(parseAnswer("Skills:\n- Go\n- Type\n  Script\nAfter", false)).toEqual([
    { kind: "paragraph", parts: [{ kind: "text", text: "Skills:" }] },
    {
      kind: "list",
      items: [
        [{ kind: "text", text: "Go" }],
        [
          { kind: "text", text: "Type" },
          { kind: "text", text: " " },
          { kind: "text", text: "Script" },
          { kind: "text", text: " " },
          { kind: "text", text: "After" },
        ],
      ],
    },
  ]);
});

test("turns single and grouped markers into citations and drops the space before them", () => {
  expect(parseAnswer("Jane works at Acme [S1]. She leads [S2, S3][S1].", false)).toEqual([
    {
      kind: "paragraph",
      parts: [
        { kind: "text", text: "Jane works at Acme" },
        { kind: "cite", sourceId: "S1" },
        { kind: "text", text: ". She leads" },
        { kind: "cite", sourceId: "S2" },
        { kind: "cite", sourceId: "S3" },
        { kind: "cite", sourceId: "S1" },
        { kind: "text", text: "." },
      ],
    },
  ]);
});

test("hides a marker that is still streaming in", () => {
  for (const tail of [" [", " [S", " [S1", " [S1,", " [S1, S2"]) {
    expect(parseAnswer(`At Acme${tail}`, true)).toEqual([
      { kind: "paragraph", parts: [{ kind: "text", text: "At Acme" }] },
    ]);
  }
  // Finished text keeps a bracket the model really wrote.
  expect(parseAnswer("At Acme [", false)).toEqual([
    { kind: "paragraph", parts: [{ kind: "text", text: "At Acme [" }] },
  ]);
});

test("does not interpret markup", () => {
  expect(parseAnswer("<b>bold</b> & <script>x</script>", false)).toEqual([
    { kind: "paragraph", parts: [{ kind: "text", text: "<b>bold</b> & <script>x</script>" }] },
  ]);
});

test("numbers citations by first use while streaming, then by the sources", () => {
  const text = "A [S3]. B [S1, S3]. C [S9].";
  expect([...citationNumbers(text, null)]).toEqual([
    ["S3", 1],
    ["S1", 2],
    ["S9", 3],
  ]);
  expect([...citationNumbers(text, [source("S3"), source("S1")])]).toEqual([
    ["S3", 1],
    ["S1", 2],
  ]);
});

test("labels a source by its CV section", () => {
  expect(sourceSectionLabel("project")).toBe("Projects");
  expect(sourceSectionLabel("certification")).toBe("Certifications");
  expect(sourceSectionLabel("profile")).toBe("Profile");
  expect(sourceSectionLabel("mystery")).toBe("mystery");
});
