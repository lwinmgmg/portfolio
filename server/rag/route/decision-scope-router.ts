import type { DecisionClient } from "@/server/domain/llm";
import type { RouteDecision, RouteInput, ScopeRouter } from "@/server/domain/rag";
import {
  buildRouteQuestion,
  buildRouteState,
  readScopeAnswer,
  ROUTE_QUESTION_KEY,
  ROUTE_TIMEOUT_MS,
  shortCircuitScope,
} from "@/server/rag/route/route-question";

export type DecisionScopeRouterOptions = {
  timeoutMs?: number;
};

// Asks a decision model for the scope. It only ever short-circuits small talk and off topic; a
// `cv` choice, a low probability or any failure defers to the rewriter.
export class DecisionScopeRouter implements ScopeRouter {
  private readonly timeoutMs: number;

  constructor(
    private readonly client: DecisionClient,
    readonly model: string,
    options: DecisionScopeRouterOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? ROUTE_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new RangeError("timeoutMs must be a positive integer.");
    }
  }

  async route(input: RouteInput): Promise<RouteDecision> {
    try {
      const result = await this.client.decide({
        model: this.model,
        state: buildRouteState(input),
        questions: { [ROUTE_QUESTION_KEY]: buildRouteQuestion(input.subjectName) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const reading = readScopeAnswer(result.answers[ROUTE_QUESTION_KEY]);
      if (!reading.ok) return deferred(reading.error, result.model);
      return {
        scope: shortCircuitScope(reading, input.minConfidence),
        probabilities: reading.probabilities,
        choice: reading.choice,
        model: result.model,
        fallback: false,
        error: null,
      };
    } catch (error) {
      return deferred(error instanceof Error ? error.message : String(error), null);
    }
  }
}

function deferred(error: string, model: string | null): RouteDecision {
  return { scope: null, probabilities: null, choice: null, model, fallback: true, error };
}
