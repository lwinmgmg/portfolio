import type { AgentTool, ToolContext } from "@/server/domain/agent";
import type { ChatEvent, ToolCallOutcome } from "@/server/domain/chat";
import type {
  ChatClient,
  ChatMessage,
  ChatRequest,
  ToolCall,
  Usage,
} from "@/server/domain/llm";

// What the loop reports. Timing, steps and the trace are the caller's: the loop only talks to
// the model and runs tools.
export type AnswerLoopEvent =
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  // The turn's one tool call is about to run.
  | { type: "tool_started"; call: ToolCall }
  | {
      type: "tool_ended";
      call: ToolCall;
      outcome: ToolCallOutcome;
      draftId: string | null;
      // For the visitor, e.g. the draft card.
      event: ChatEvent | null;
      // Why a tool threw (`failed`), for the log and the trace. The model gets no detail.
      error: string | null;
    }
  // A call after the turn's first, or one made in round 2. It is not run.
  | { type: "tool_ignored"; call: ToolCall }
  // Usage summed over the rounds; null when no round reported any.
  | { type: "done"; usage: Usage | null; rounds: 1 | 2 };

export type AnswerLoopInput = {
  chat: ChatClient;
  // Round 1's request, without tools. The loop adds them.
  request: ChatRequest;
  // Empty: one plain call, as before tools existed, and any tool call is dropped.
  tools: readonly AgentTool[];
  context: ToolContext;
};

const IGNORED_RESULT = JSON.stringify({
  status: "ignored",
  error: "Only one tool call is allowed per turn. This one was not run.",
});

const INVALID_RESULT = JSON.stringify({
  status: "invalid",
  error: "The arguments did not match the tool's parameters, so it did not run.",
});

const FAILED_RESULT = JSON.stringify({
  status: "error",
  error: "The tool failed, so nothing was done. The visitor can try again later.",
});

// At most one tool round per turn: model (tools, `auto`) → the first tool call → model (`none`)
// → final text. Round 2 runs only when round 1 called a tool. The answer is round 1's text,
// then round 2's.
export async function* runAnswerLoop(
  input: AnswerLoopInput,
): AsyncGenerator<AnswerLoopEvent, void, undefined> {
  const { chat, request, tools, context } = input;
  if (tools.length === 0) {
    const round = yield* streamRound(chat, request, "");
    yield { type: "done", usage: round.usage, rounds: 1 };
    return;
  }

  const definitions = tools.map((tool) => tool.definition);
  const first = yield* streamRound(chat, { ...request, tools: definitions, toolChoice: "auto" }, "");
  if (first.calls.length === 0) {
    yield { type: "done", usage: first.usage, rounds: 1 };
    return;
  }

  const results: ChatMessage[] = [];
  for (const [index, call] of first.calls.entries()) {
    if (index > 0) {
      yield { type: "tool_ignored", call };
      results.push(toolMessage(call, IGNORED_RESULT));
      continue;
    }
    // A visitor who stopped during round 1 gets no draft.
    request.signal?.throwIfAborted();
    yield { type: "tool_started", call };
    const { resultForModel, ...ran } = await runTool(tools, call, context);
    yield { type: "tool_ended", call, ...ran };
    results.push(toolMessage(call, resultForModel));
  }

  // Every call needs its result, so round 2 sees the whole exchange.
  const second = yield* streamRound(
    chat,
    {
      ...request,
      messages: [
        ...request.messages,
        { role: "assistant", content: first.text, toolCalls: first.calls },
        ...results,
      ],
      tools: definitions,
      toolChoice: "none",
    },
    first.text,
  );
  for (const call of second.calls) yield { type: "tool_ignored", call };
  yield { type: "done", usage: addUsage(first.usage, second.usage), rounds: 2 };
}

type Round = { text: string; calls: ToolCall[]; usage: Usage | null };

// `before`: the answer so far. Round 2's text starts on a new paragraph after it.
async function* streamRound(
  chat: ChatClient,
  request: ChatRequest,
  before: string,
): AsyncGenerator<AnswerLoopEvent, Round, undefined> {
  const round: Round = { text: "", calls: [], usage: null };
  let separated = before === "" || /\s$/.test(before);
  for await (const event of chat.stream(request)) {
    switch (event.type) {
      case "reasoning":
        yield event;
        break;
      case "delta":
        if (!separated) {
          separated = true;
          yield { type: "delta", text: "\n\n" };
        }
        round.text += event.text;
        yield event;
        break;
      case "tool_call":
        round.calls.push(event.call);
        break;
      case "done":
        round.usage = event.usage;
        break;
    }
  }
  return round;
}

type ToolRun = Omit<Extract<AnswerLoopEvent, { type: "tool_ended" }>, "type" | "call"> & {
  resultForModel: string;
};

async function runTool(
  tools: readonly AgentTool[],
  call: ToolCall,
  context: ToolContext,
): Promise<ToolRun> {
  const tool = tools.find((candidate) => candidate.definition.name === call.name);
  if (!tool) {
    return {
      outcome: "unknown_tool",
      resultForModel: JSON.stringify({
        status: "error",
        error: `There is no tool named "${call.name}". Answer without it.`,
      }),
      draftId: null,
      event: null,
      error: null,
    };
  }
  const args = tool.parse(parseJson(call.arguments));
  if (args === null) {
    return { outcome: "invalid", resultForModel: INVALID_RESULT, draftId: null, event: null, error: null };
  }
  try {
    const { resultForModel, event, outcome, draftId } = await tool.run(args, context);
    return { outcome, resultForModel, draftId, event, error: null };
  } catch (error) {
    return {
      outcome: "failed",
      resultForModel: FAILED_RESULT,
      draftId: null,
      event: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Undefined for text that is not JSON; the tool's `parse` then rejects it.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toolMessage(call: ToolCall, content: string): ChatMessage {
  return { role: "tool", toolCallId: call.id, content };
}

function addUsage(first: Usage | null, second: Usage | null): Usage | null {
  if (first === null) return second;
  if (second === null) return first;
  return {
    promptTokens: first.promptTokens + second.promptTokens,
    completionTokens: first.completionTokens + second.completionTokens,
    cost: first.cost === null && second.cost === null ? null : (first.cost ?? 0) + (second.cost ?? 0),
  };
}
