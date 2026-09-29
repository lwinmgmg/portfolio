import { expect, test } from "bun:test";

import type { ChatTurn } from "@/server/domain/chat";
import type { ChoiceAnswer } from "@/server/domain/llm";
import { scopeDefinitions } from "@/server/rag/query/rewrite-prompt";
import {
  buildRouteQuestion,
  buildRouteState,
  readScopeAnswer,
  shortCircuitScope,
} from "@/server/rag/route/route-question";

function answer(choice: string, probabilities: Record<string, number>): ChoiceAnswer {
  return { choice, confidence: 0.5, probabilities };
}

test("the route question is a choice over the rewriter's scope definitions, contact folded into cv", () => {
  const question = buildRouteQuestion("Ada Lovelace");
  const definitions = scopeDefinitions("Ada Lovelace");

  expect(question.type).toBe("choice");
  expect(Object.keys(question.criteria)).toEqual(["cv", "smalltalk", "off_topic"]);
  expect(question.criteria.cv).toBe(`${definitions.cv} Also when ${definitions.contact}`);
  expect(question.criteria.smalltalk).toBe(definitions.smalltalk);
  expect(question.criteria.off_topic).toBe(definitions.off_topic);
  expect(question.instructions).toContain("Ada Lovelace");
});

test("a contact choice from the router is not a known option", () => {
  expect(
    readScopeAnswer({
      choice: "contact",
      confidence: 0.9,
      probabilities: { cv: 0.05, smalltalk: 0.03, off_topic: 0.02, contact: 0.9 },
    }).ok,
  ).toBe(false);
});

test("the state keeps the last 6 turns, oldest first", () => {
  const history: ChatTurn[] = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: `turn ${index}`,
  }));

  const state = buildRouteState({ message: "and before that?", history, subjectName: "Ada" });

  expect(state.subject).toBe("Ada");
  expect(state.message).toBe("and before that?");
  expect(state.history.map((turn) => turn.text)).toEqual([
    "turn 2",
    "turn 3",
    "turn 4",
    "turn 5",
    "turn 6",
    "turn 7",
  ]);
});

test("reads a complete answer", () => {
  expect(readScopeAnswer(answer("smalltalk", { cv: 0.1, smalltalk: 0.85, off_topic: 0.05 }))).toEqual({
    ok: true,
    choice: "smalltalk",
    probabilities: { cv: 0.1, smalltalk: 0.85, off_topic: 0.05 },
  });
});

test("a missing answer, an unknown option or missing probabilities are errors", () => {
  expect(readScopeAnswer(undefined).ok).toBe(false);
  expect(readScopeAnswer(answer("weather", { cv: 0.1, smalltalk: 0.1, off_topic: 0.8 })).ok).toBe(false);
  expect(
    readScopeAnswer(answer("cv", { cv: 0.8, smalltalk: 0.1, off_topic: 0.05, weather: 0.05 })).ok,
  ).toBe(false);
  expect(readScopeAnswer(answer("cv", { cv: 0.9, smalltalk: 0.1 })).ok).toBe(false);
  expect(readScopeAnswer(answer("cv", { cv: 1.2, smalltalk: 0, off_topic: 0 })).ok).toBe(false);
});

test("only a confident small talk or off-topic choice short-circuits", () => {
  const smalltalk = readScopeAnswer(answer("smalltalk", { cv: 0.2, smalltalk: 0.8, off_topic: 0 }));
  const offTopic = readScopeAnswer(answer("off_topic", { cv: 0.05, smalltalk: 0.05, off_topic: 0.9 }));
  const cv = readScopeAnswer(answer("cv", { cv: 0.99, smalltalk: 0.01, off_topic: 0 }));

  expect(shortCircuitScope(smalltalk, 0.8)).toBe("smalltalk");
  expect(shortCircuitScope(smalltalk, 0.81)).toBeNull();
  expect(shortCircuitScope(offTopic, 0.8)).toBe("off_topic");
  expect(shortCircuitScope(cv, 0.5)).toBeNull();
  expect(shortCircuitScope({ ok: false, error: "boom" }, 0.5)).toBeNull();
});
