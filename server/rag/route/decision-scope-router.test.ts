import { expect, test } from "bun:test";

import type { ChatTurn } from "@/server/domain/chat";
import {
  LlmProviderError,
  type ChoiceAnswer,
  type DecisionClient,
  type DecisionRequest,
  type DecisionResult,
} from "@/server/domain/llm";
import type { RouteInput } from "@/server/domain/rag";
import { DecisionScopeRouter } from "@/server/rag/route/decision-scope-router";
import type { RouteState } from "@/server/rag/route/route-question";

class FakeDecisions implements DecisionClient {
  readonly requests: DecisionRequest[] = [];

  constructor(private readonly respond: () => DecisionResult | Error) {}

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    this.requests.push(request);
    const result = this.respond();
    if (result instanceof Error) throw result;
    return result;
  }
}

function answering(answer: ChoiceAnswer): FakeDecisions {
  return new FakeDecisions(() => ({
    answers: { scope: answer },
    model: "typesafe/jev-1.13-20260917",
    usage: null,
  }));
}

function choice(scope: string, probability: number): ChoiceAnswer {
  const rest = (1 - probability) / 2;
  const probabilities: Record<string, number> = { cv: rest, smalltalk: rest, off_topic: rest };
  probabilities[scope] = probability;
  return { choice: scope, confidence: probability, probabilities };
}

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return { message: "hi, thanks!", history: [], subjectName: "Jane Doe", minConfidence: 0.8, ...overrides };
}

test("confident small talk and off topic short-circuit", async () => {
  const confident: ChoiceAnswer = {
    choice: "smalltalk",
    confidence: 0.9,
    probabilities: { cv: 0.03, smalltalk: 0.95, off_topic: 0.02 },
  };
  const smalltalk = await new DecisionScopeRouter(answering(confident), "jev").route(input());
  const offTopic = await new DecisionScopeRouter(answering(choice("off_topic", 0.9)), "jev").route(input());

  expect(smalltalk).toEqual({
    scope: "smalltalk",
    probabilities: { cv: 0.03, smalltalk: 0.95, off_topic: 0.02 },
    choice: "smalltalk",
    model: "typesafe/jev-1.13-20260917",
    fallback: false,
    error: null,
  });
  expect(offTopic.scope).toBe("off_topic");
});

test("a confident cv choice defers to the rewriter", async () => {
  const decision = await new DecisionScopeRouter(answering(choice("cv", 0.99)), "jev").route(input());

  expect(decision.scope).toBeNull();
  expect(decision.choice).toBe("cv");
  expect(decision.fallback).toBe(false);
});

test("just below the cutoff defers; exactly at it short-circuits", async () => {
  const below = await new DecisionScopeRouter(answering(choice("smalltalk", 0.79)), "jev").route(input());
  const at = await new DecisionScopeRouter(answering(choice("smalltalk", 0.8)), "jev").route(input());

  expect(below.scope).toBeNull();
  expect(below.fallback).toBe(false);
  expect(at.scope).toBe("smalltalk");
});

test("an error, a 429 and an unknown option all defer with a fallback", async () => {
  const failures = [
    new FakeDecisions(() => new Error("socket hang up")),
    new FakeDecisions(
      () => new LlmProviderError("Rate limit exceeded", { status: 429, retryable: true }),
    ),
    answering(choice("weather", 0.9)),
  ];

  const decisions = await Promise.all(
    failures.map((client) => new DecisionScopeRouter(client, "jev").route(input())),
  );

  expect(decisions.map((decision) => [decision.scope, decision.fallback, decision.error])).toEqual([
    [null, true, "socket hang up"],
    [null, true, "Rate limit exceeded"],
    [null, true, 'Unknown scope option "weather"'],
  ]);
  expect(decisions[2]?.model).toBe("typesafe/jev-1.13-20260917");
});

test("sends one scope question with the last 6 turns and a timeout signal", async () => {
  const client = answering(choice("cv", 0.9));
  const history: ChatTurn[] = Array.from({ length: 9 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: `turn ${index}`,
  }));

  await new DecisionScopeRouter(client, "typesafe/jev-1.13").route(input({ message: "and before that?", history }));

  const request = client.requests[0];
  expect(request?.model).toBe("typesafe/jev-1.13");
  expect(Object.keys(request?.questions ?? {})).toEqual(["scope"]);
  expect(request?.questions.scope?.type).toBe("choice");
  expect(request?.signal instanceof AbortSignal).toBe(true);
  const state = request?.state as RouteState;
  expect(state.message).toBe("and before that?");
  expect(state.subject).toBe("Jane Doe");
  expect(state.history.map((turn) => turn.text)).toEqual([
    "turn 3",
    "turn 4",
    "turn 5",
    "turn 6",
    "turn 7",
    "turn 8",
  ]);
});
