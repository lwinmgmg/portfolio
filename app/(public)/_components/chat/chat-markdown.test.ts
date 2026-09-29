import { expect, test } from "bun:test";

import { parseAnswer, parseInline } from "@/app/(public)/_components/chat/chat-markdown";

const text = (value: string) => ({ kind: "text", text: value });

test("splits paragraphs on blank lines and keeps single line breaks", () => {
  expect(parseAnswer("First line\nsecond line\n\nNext paragraph", false)).toEqual([
    { kind: "paragraph", content: [text("First line\nsecond line")] },
    { kind: "paragraph", content: [text("Next paragraph")] },
  ]);
});

test("reads strong, emphasis, code and nested emphasis", () => {
  expect(parseInline("**Go** and *Rust*, `bun test`, __all__ _of_ ***it***")).toEqual([
    { kind: "strong", children: [text("Go")] },
    text(" and "),
    { kind: "em", children: [text("Rust")] },
    text(", "),
    { kind: "code", text: "bun test" },
    text(", "),
    { kind: "strong", children: [text("all")] },
    text(" "),
    { kind: "em", children: [text("of")] },
    text(" "),
    { kind: "strong", children: [{ kind: "em", children: [text("it")] }] },
  ]);
  expect(parseInline("*a **b** c*")).toEqual([
    { kind: "em", children: [text("a "), { kind: "strong", children: [text("b")] }, text(" c")] },
  ]);
});

test("leaves unmatched and in-word delimiters as written", () => {
  expect(parseInline("5 * 3 * 2, snake_case_name, **open")).toEqual([
    text("5 * 3 * 2, snake_case_name, **open"),
  ]);
  expect(parseInline(String.raw`\*not em\*`)).toEqual([text("*not em*")]);
});

test("links only web and mail addresses", () => {
  expect(parseInline("[site](https://example.com) [mail](mailto:jane@example.com)")).toEqual([
    { kind: "link", href: "https://example.com/", children: [text("site")] },
    text(" "),
    { kind: "link", href: "mailto:jane@example.com", children: [text("mail")] },
  ]);
  expect(parseInline("[x](javascript:alert(1)) [y](data:text/html,hi)")).toEqual([
    text("[x](javascript:alert(1)) "),
    text("y"),
  ]);
});

test("turns single and grouped markers into citations, also inside strong text", () => {
  expect(parseInline("Works at **Acme [S1]**. Leads [S2, S3][S1].")).toEqual([
    text("Works at "),
    { kind: "strong", children: [text("Acme"), { kind: "cite", sourceId: "S1" }] },
    text(". Leads"),
    { kind: "cite", sourceId: "S2" },
    { kind: "cite", sourceId: "S3" },
    { kind: "cite", sourceId: "S1" },
    text("."),
  ]);
});

test("reads unordered, ordered and nested lists", () => {
  const answer = "Skills:\n- **Go**\n  - gRPC\n- Type\n  Script\n\n3. Third\n4) Fourth";
  expect(parseAnswer(answer, false)).toEqual([
    { kind: "paragraph", content: [text("Skills:")] },
    {
      kind: "list",
      ordered: false,
      start: 1,
      items: [
        {
          content: [{ kind: "strong", children: [text("Go")] }],
          lists: [
            { kind: "list", ordered: false, start: 1, items: [{ content: [text("gRPC")], lists: [] }] },
          ],
        },
        { content: [text("Type Script")], lists: [] },
      ],
    },
    {
      kind: "list",
      ordered: true,
      start: 3,
      items: [
        { content: [text("Third")], lists: [] },
        { content: [text("Fourth")], lists: [] },
      ],
    },
  ]);
});

test("reads headings, rules and code fences", () => {
  const answer = "## Summary ##\n---\n```ts\nconst a = **1**;\n```\n* * *";
  expect(parseAnswer(answer, false)).toEqual([
    { kind: "heading", content: [text("Summary")] },
    { kind: "rule" },
    { kind: "code", text: "const a = **1**;" },
    { kind: "rule" },
  ]);
  // A fence still streaming in shows what has arrived.
  expect(parseAnswer("```\nline", true)).toEqual([{ kind: "code", text: "line" }]);
});

test("hides a citation marker that is still streaming in", () => {
  for (const tail of [" [", " [S", " [S1", " [S1,", " [S1, S2"]) {
    expect(parseAnswer(`At Acme${tail}`, true)).toEqual([
      { kind: "paragraph", content: [text("At Acme")] },
    ]);
  }
  // Finished text keeps a bracket the model really wrote.
  expect(parseAnswer("At Acme [", false)).toEqual([
    { kind: "paragraph", content: [text("At Acme [")] },
  ]);
});

test("does not interpret HTML", () => {
  expect(parseAnswer("<b>bold</b> & <script>x</script>", false)).toEqual([
    { kind: "paragraph", content: [text("<b>bold</b> & <script>x</script>")] },
  ]);
});
