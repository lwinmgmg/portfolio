import { expect, test } from "bun:test";

import { thrownBy, sampleCorpus } from "@/server/rag/__fixtures__/sample-corpus";
import { StructuredCvChunker } from "@/server/rag/chunking/structured-cv-chunker";
import {
  GoldenSetError,
  parseGoldenSet,
  selectByTags,
  unknownEntityKeys,
} from "@/server/rag/eval/golden-set";
import golden from "@/evals/cv-retrieval.golden.json";

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  question: `Question ${id}?`,
  relevantEntityKeys: ["profile"],
  ...extra,
});

function errorOf(value: unknown): GoldenSetError {
  const error = thrownBy(() => parseGoldenSet(value));
  if (!(error instanceof GoldenSetError)) throw new Error("Expected a GoldenSetError.");
  return error;
}

test("history and tags default to empty, the scope to cv, and text is trimmed", () => {
  expect(parseGoldenSet([item(" q1 ", { question: "  Where?  " })])).toEqual([
    {
      id: "q1",
      question: "Where?",
      history: [],
      expectedScope: "cv",
      relevantEntityKeys: ["profile"],
      tags: [],
    },
  ]);
});

test("only a non-cv item may leave out its relevant keys", () => {
  const [greeting] = parseGoldenSet([
    { id: "hi", question: "hi!", expectedScope: "smalltalk", tags: ["scope"] },
  ]);
  expect(greeting?.relevantEntityKeys).toEqual([]);
  expect(errorOf([{ id: "q1", question: "Where?" }]).message).toContain("relevant entity key");
  errorOf([item("q1", { expectedScope: "weather" })]);
});

test("keeps history turns in order", () => {
  const history = [
    { role: "user", text: "Any certifications?" },
    { role: "assistant", text: "Yes, one." },
  ];
  expect(parseGoldenSet([item("q1", { history })])[0]?.history).toEqual(history);
});

test("rejects empty sets, blank fields, missing keys, unknown fields and bad roles", () => {
  expect(errorOf([]).message).toContain("Invalid golden set");
  errorOf([item("q1", { question: "   " })]);
  errorOf([item("q1", { relevantEntityKeys: [] })]);
  errorOf([item("q1", { relevantEntitykeys: ["profile"] })]);
  errorOf([item("q1", { history: [{ role: "system", text: "hi" }] })]);
  errorOf({ id: "q1" });
});

test("rejects duplicate ids and names them", () => {
  expect(errorOf([item("q1"), item("q2"), item("q1")]).message).toContain('Duplicate id "q1"');
});

test("selectByTags keeps items with any given tag, or all without tags", () => {
  const items = parseGoldenSet([
    item("a", { tags: ["experience"] }),
    item("b", { tags: ["skills", "follow-up"] }),
    item("c"),
  ]);
  expect(selectByTags(items, []).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  expect(selectByTags(items, ["follow-up", "experience"]).map((entry) => entry.id)).toEqual(["a", "b"]);
  expect(selectByTags(items, ["education"])).toEqual([]);
});

test("unknownEntityKeys lists keys no chunk carries, per item", () => {
  const items = parseGoldenSet([
    item("a", { relevantEntityKeys: ["profile", "experience:typo"] }),
    item("b"),
  ]);
  expect(unknownEntityKeys(items, new Set(["profile"]))).toEqual([
    { itemId: "a", keys: ["experience:typo"] },
  ]);
});

test("the committed golden file parses and its example keys exist in the fixture CV", () => {
  const items = parseGoldenSet(golden);
  const examples = selectByTags(items, ["example"]).filter((entry) => entry.expectedScope === "cv");
  expect(examples.length).toBe(5);
  const keys = new Set(new StructuredCvChunker().chunk(sampleCorpus).flatMap((chunk) => chunk.entityKeys));
  expect(unknownEntityKeys(examples, keys)).toEqual([]);
});
