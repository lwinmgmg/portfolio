import { expect, test } from "bun:test";

import { withoutName } from "@/server/rag/rerank/without-name";

const NAME = "Lwin Maung Maung";

test("removes the name with its possessive, in any case", () => {
  expect(withoutName("What is LWIN MAUNG MAUNG's role at Clinics Medical Group?", NAME)).toBe(
    "What is role at Clinics Medical Group?",
  );
  expect(withoutName("lwin maung maung’s projects", NAME)).toBe("projects");
  expect(withoutName("Where has Lwin Maung Maung worked?", NAME)).toBe("Where has worked?");
});

test("matches any whitespace between the name's words", () => {
  expect(withoutName("Skills of Lwin\n  Maung\tMaung, in short", `  ${NAME} `)).toBe(
    "Skills of, in short",
  );
});

test("keeps newlines and tidies each line", () => {
  expect(
    withoutName("Lwin Maung Maung's experience at Acme.\n\nLead engineer ( Lwin Maung Maung )", NAME),
  ).toBe("experience at Acme.\n\nLead engineer ()");
});

test("leaves a part of the name and a longer word alone", () => {
  expect(withoutName("Lwin's projects", NAME)).toBe("Lwin's projects");
  expect(withoutName("Lwin Maung Maungs", NAME)).toBe("Lwin Maung Maungs");
  expect(withoutName("Will Smith will lead", "Will Smith")).toBe("will lead");
});

test("returns a text without the name unchanged, spacing included", () => {
  expect(withoutName("Key  skills :  Go", NAME)).toBe("Key  skills :  Go");
});

test("returns the original when the name is empty or is the whole text", () => {
  expect(withoutName("Who is it?", "  ")).toBe("Who is it?");
  expect(withoutName("Lwin Maung Maung", NAME)).toBe("Lwin Maung Maung");
  expect(withoutName("  Lwin Maung Maung's ", NAME)).toBe("  Lwin Maung Maung's ");
});

test("treats regex characters in the name literally", () => {
  expect(withoutName("Ask J.R. (Bob) Doe+ anything", "J.R. (Bob) Doe+")).toBe("Ask anything");
  expect(withoutName("JXR Bob Doe", "J.R. Bob Doe")).toBe("JXR Bob Doe");
});
