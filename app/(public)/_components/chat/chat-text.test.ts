import { expect, test } from "bun:test";

import { citationNumbers, sourceSectionLabel } from "@/app/(public)/_components/chat/chat-text";
import type { ChatSource } from "@/server/domain/chat";

function source(sourceId: string): ChatSource {
  return { sourceId, entityKeys: [], title: sourceId, section: "experience", anchor: null };
}

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
