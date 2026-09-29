import { expect, test } from "bun:test";

import { FakeRetrievalRunner, readyIndex } from "@/server/rag/__fixtures__/fake-retrieval-runner";
import {
  failedQuestions,
  indexLabel,
  renderEvalMarkdown,
  reportFileName,
} from "@/server/rag/eval/eval-report";
import { parseGoldenSet } from "@/server/rag/eval/golden-set";
import { RetrievalEvaluator } from "@/server/rag/eval/retrieval-evaluator";

const ITEMS = parseGoldenSet([
  { id: "work", question: "Where does\nshe work?", relevantEntityKeys: ["experience:acme"] },
  { id: "school", question: "Where did she study?", relevantEntityKeys: ["education:tu"] },
  { id: "hobby", question: "What are her hobbies?", relevantEntityKeys: ["other:hobbies"] },
  { id: "broken", question: "Broken?", relevantEntityKeys: ["profile"] },
]);

const ANSWERS = {
  "Where does\nshe work?": [["experience:acme"]],
  "Where did she study?": [["profile"], ["skills:languages"], ["project:portfolio"], ["language:en"]],
};

async function report() {
  const runner = new FakeRetrievalRunner(ANSWERS, { "Broken?": "rate limited" });
  return new RetrievalEvaluator({ runner, now: () => new Date("2026-09-29T08:00:00.000Z") }).evaluate({
    items: ITEMS,
    targets: [
      {
        index: readyIndex("aaaaaa111111"),
        entityKeys: new Set(["experience:acme", "education:tu", "profile"]),
      },
      {
        index: readyIndex("bbbbbb222222", { chunker: "token-window", contextualize: false, contextModel: null }),
        entityKeys: new Set(["experience:acme", "education:tu", "profile", "other:hobbies"]),
      },
    ],
    presets: ["hybrid", "hybrid-rerank"],
    ks: [1, 3, 5],
    subjectName: "Jane Doe",
    tags: ["experience"],
  });
}

test("labels indexes by chunker, context and id suffix", () => {
  expect(indexLabel(readyIndex("abcdef123456"))).toBe("structured, contextual (123456)");
  expect(indexLabel(readyIndex("x1", { chunker: "token-window", contextualize: false }))).toBe(
    "token-window, plain (x1)",
  );
});

test("report file names are ISO timestamps without colons", () => {
  expect(reportFileName("2026-09-29T08:00:00.000Z")).toBe("2026-09-29T08-00-00.000Z.json");
});

test("renders one table row per index and preset", async () => {
  const markdown = renderEvalMarkdown(await report());
  expect(markdown).toContain("4 questions tagged experience for Jane Doe");
  expect(markdown).toContain("(finalK 5)");
  expect(markdown).toContain(
    "| Index | Preset | hit@1 | hit@3 | hit@5 | recall@5 | MRR | scope acc | cv skipped | router fallbacks " +
      "| mean total ms | mean rerank ms | errors |",
  );
  expect(markdown).toContain("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  // `hobby` ends as off topic (skipped) and `broken` fails, so 2 of 4 scopes match.
  expect(markdown).toContain(
    "| structured, contextual (111111) | hybrid | 0.250 | 0.250 | 0.250 | 0.250 | 0.250 | 0.500 | 1/4 | 0 | 4 | — | 1 |",
  );
  expect(markdown).toContain(
    "| token-window, plain (222222) | hybrid-rerank | 0.250 | 0.250 | 0.250 | 0.250 | 0.250 | 0.500 | 1/4 | 0 | 8 | 5 | 1 |",
  );
  expect(markdown).toContain("- token-window, plain (222222): `bbbbbb222222`, embeddings embed-model, built");
  expect(markdown).not.toContain("token-window, plain (222222): `bbbbbb222222`, embeddings embed-model, context");
});

test("lists failed questions with their top 3 titles, errors and empty results", async () => {
  const markdown = renderEvalMarkdown(await report());
  expect(markdown).toContain("## Failed questions (hit@5 = 0)");
  expect(markdown).toContain("### structured, contextual (111111) · hybrid");
  expect(markdown).toContain("- `school` Where did she study? → profile; skills:languages; project:portfolio");
  expect(markdown).not.toContain("language:en");
  expect(markdown).toContain("- `hobby` What are her hobbies? → no chunks (scope off_topic)");
  expect(markdown).toContain("- `broken` Broken? → error at lexical-search: rate limited");
  expect(markdown).not.toContain("`work`");
});

test("lists golden keys missing from each index", async () => {
  const markdown = renderEvalMarkdown(await report());
  expect(markdown).toContain("## Relevant keys missing from the index");
  expect(markdown).toContain("- structured, contextual (111111): `hobby` other:hobbies");
  expect(markdown).not.toContain("token-window, plain (222222): `hobby`");
});

test("lists scope mismatches, with a failed run as an error", async () => {
  const markdown = renderEvalMarkdown(await report());
  expect(markdown).toContain("## Scope mismatches");
  expect(markdown).toContain("- `hobby` What are her hobbies? → expected cv, got off_topic");
  expect(markdown).toContain("- `broken` Broken? → expected cv, got an error");
});

test("failedQuestions uses hit@k", async () => {
  const [run] = (await report()).runs;
  if (!run) throw new Error("Expected a run.");
  expect(failedQuestions(run, 5).map((result) => result.itemId)).toEqual(["school", "hobby", "broken"]);
});
