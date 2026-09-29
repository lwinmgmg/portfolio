import { expect, test } from "bun:test";

import { runAnswerLoop, type AnswerLoopEvent } from "@/server/agent/answer-loop";
import type { AgentTool, ToolContext } from "@/server/domain/agent";
import type {
  ChatClient,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  ToolCall,
  Usage,
} from "@/server/domain/llm";

// One scripted stream per round, in order.
class ScriptedChat implements ChatClient {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly rounds: ChatStreamEvent[][]) {}

  complete(): Promise<ChatResult> {
    throw new Error("complete is not used by the answer loop");
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    this.requests.push(structuredClone({ ...request, signal: undefined }));
    const round = this.rounds.shift();
    if (!round) throw new Error("unexpected round");
    for (const event of round) yield event;
  }
}

type Echo = { text: string };

// A tool that echoes its text; `fails` makes it throw.
function echoTool(runs: Echo[], options: { fails?: boolean } = {}): AgentTool<Echo> {
  return {
    definition: { name: "echo", description: "Echo the text.", parameters: { type: "object" } },
    parse: (args) =>
      typeof args === "object" && args !== null && "text" in args && typeof args.text === "string"
        ? { text: args.text }
        : null,
    run: async (args) => {
      if (options.fails) throw new Error("database down");
      runs.push(args);
      return {
        resultForModel: '{"status":"draft_shown"}',
        event: { type: "email_draft", draft: { id: "d1", text: args.text } },
        outcome: "drafted",
        draftId: "d1",
      };
    },
  };
}

const context: ToolContext = {
  conversationId: "conv-1",
  sessionId: "session-1",
  now: new Date("2026-09-29T12:00:00.000Z"),
};

const request: ChatRequest = {
  model: "answer-model",
  messages: [
    { role: "system", content: "rules" },
    { role: "user", content: "Tell Lwin I'd like to talk. I'm Jane, jane@example.com" },
  ],
  temperature: 0.2,
};

const usage = (promptTokens: number, cost: number | null): Usage => ({
  promptTokens,
  completionTokens: 10,
  cost,
});

function call(id: string, name: string, args: string): ChatStreamEvent {
  return { type: "tool_call", call: { id, name, arguments: args } };
}

const echoCall: ToolCall = { id: "call-1", name: "echo", arguments: '{"text":"Hi Lwin"}' };

async function collect(events: AsyncIterable<AnswerLoopEvent>): Promise<AnswerLoopEvent[]> {
  const all: AnswerLoopEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

test("without tools it makes one plain call and drops any tool call", async () => {
  const chat = new ScriptedChat([
    [
      { type: "delta", text: "Hello" },
      call("c", "echo", "{}"),
      { type: "done", usage: usage(10, 0.1) },
    ],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [], context }));

  expect(events).toEqual([
    { type: "delta", text: "Hello" },
    { type: "done", usage: usage(10, 0.1), rounds: 1 },
  ]);
  expect(chat.requests).toHaveLength(1);
  expect(Object.keys(chat.requests[0] ?? {})).not.toContain("tools");
  expect(Object.keys(chat.requests[0] ?? {})).not.toContain("toolChoice");
});

test("with tools and no call there is one round with the tools on auto", async () => {
  const runs: Echo[] = [];
  const chat = new ScriptedChat([
    [
      { type: "reasoning", text: "A CV question." },
      { type: "delta", text: "She worked at Acme [S1]." },
      { type: "done", usage: null },
    ],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool(runs)], context }));

  expect(events.map((event) => event.type)).toEqual(["reasoning", "delta", "done"]);
  expect(events.at(-1)).toEqual({ type: "done", usage: null, rounds: 1 });
  expect(chat.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["echo"]);
  expect(chat.requests[0]?.toolChoice).toBe("auto");
  expect(runs).toHaveLength(0);
});

test("a tool call runs the tool, then round 2 gets the call and its result with tool choice none", async () => {
  const runs: Echo[] = [];
  const chat = new ScriptedChat([
    [
      { type: "reasoning", text: "Jane gave her details." },
      { type: "tool_call", call: echoCall },
      { type: "done", usage: usage(200, 0.001) },
    ],
    [
      { type: "reasoning", text: "Tell her to press Send." },
      { type: "delta", text: "I've drafted a message. " },
      { type: "delta", text: "Check it and press Send." },
      { type: "done", usage: usage(250, null) },
    ],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool(runs)], context }));

  expect(events).toEqual([
    { type: "reasoning", text: "Jane gave her details." },
    { type: "tool_started", call: echoCall },
    {
      type: "tool_ended",
      call: echoCall,
      outcome: "drafted",
      draftId: "d1",
      event: { type: "email_draft", draft: { id: "d1", text: "Hi Lwin" } },
      error: null,
    },
    { type: "reasoning", text: "Tell her to press Send." },
    { type: "delta", text: "I've drafted a message. " },
    { type: "delta", text: "Check it and press Send." },
    {
      type: "done",
      usage: { promptTokens: 450, completionTokens: 20, cost: 0.001 },
      rounds: 2,
    },
  ]);
  expect(runs).toEqual([{ text: "Hi Lwin" }]);

  const second = chat.requests[1];
  expect(second?.toolChoice).toBe("none");
  expect(second?.tools?.map((tool) => tool.name)).toEqual(["echo"]);
  expect(second?.model).toBe("answer-model");
  expect(second?.temperature).toBe(0.2);
  expect(second?.messages.slice(2)).toEqual([
    { role: "assistant", content: "", toolCalls: [echoCall] },
    { role: "tool", toolCallId: "call-1", content: '{"status":"draft_shown"}' },
  ]);
});

test("round 1 text is kept, and round 2 starts a new paragraph after it", async () => {
  const chat = new ScriptedChat([
    [
      { type: "delta", text: "Sure." },
      { type: "tool_call", call: echoCall },
      { type: "done", usage: null },
    ],
    [
      { type: "delta", text: "Press Send." },
      { type: "done", usage: null },
    ],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool([])], context }));

  const text = events.flatMap((event) => (event.type === "delta" ? [event.text] : [])).join("");
  expect(text).toBe("Sure.\n\nPress Send.");
  expect(chat.requests[1]?.messages[2]).toEqual({
    role: "assistant",
    content: "Sure.",
    toolCalls: [echoCall],
  });
});

test("invalid arguments do not run the tool and tell the model", async () => {
  for (const args of ["{not json", '{"body":"Hi"}', ""]) {
    const runs: Echo[] = [];
    const chat = new ScriptedChat([
      [call("call-1", "echo", args), { type: "done", usage: null }],
      [{ type: "delta", text: "I could not draft that." }, { type: "done", usage: null }],
    ]);

    const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool(runs)], context }));

    expect(runs).toHaveLength(0);
    expect(events[1]).toMatchObject({ type: "tool_ended", outcome: "invalid", event: null });
    const result = chat.requests[1]?.messages[3];
    expect(result?.role).toBe("tool");
    expect(JSON.parse(String(result?.content))).toMatchObject({ status: "invalid" });
  }
});

test("an unknown tool name gets an error result and nothing runs", async () => {
  const runs: Echo[] = [];
  const chat = new ScriptedChat([
    [call("call-1", "delete_everything", "{}"), { type: "done", usage: null }],
    [{ type: "delta", text: "I can't do that." }, { type: "done", usage: null }],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool(runs)], context }));

  expect(runs).toHaveLength(0);
  expect(events[1]).toMatchObject({ type: "tool_ended", outcome: "unknown_tool", draftId: null });
  expect(JSON.parse(String(chat.requests[1]?.messages[3]?.content))).toEqual({
    status: "error",
    error: 'There is no tool named "delete_everything". Answer without it.',
  });
});

test("only the first call runs; a second is ignored but still gets a result", async () => {
  const runs: Echo[] = [];
  const second: ToolCall = { id: "call-2", name: "echo", arguments: '{"text":"Again"}' };
  const chat = new ScriptedChat([
    [
      { type: "tool_call", call: echoCall },
      { type: "tool_call", call: second },
      { type: "done", usage: null },
    ],
    [{ type: "delta", text: "Drafted." }, { type: "done", usage: null }],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool(runs)], context }));

  expect(runs).toEqual([{ text: "Hi Lwin" }]);
  expect(events.map((event) => event.type)).toEqual([
    "tool_started",
    "tool_ended",
    "tool_ignored",
    "delta",
    "done",
  ]);
  expect(chat.requests[1]?.messages.slice(2).map((message) => message.role)).toEqual([
    "assistant",
    "tool",
    "tool",
  ]);
  expect(chat.requests[1]?.messages[4]).toMatchObject({ role: "tool", toolCallId: "call-2" });
  expect(JSON.parse(String(chat.requests[1]?.messages[4]?.content))).toMatchObject({
    status: "ignored",
  });
});

test("a call in round 2 is ignored and there is no third round", async () => {
  const late: ToolCall = { id: "call-9", name: "echo", arguments: '{"text":"Late"}' };
  const runs: Echo[] = [];
  const chat = new ScriptedChat([
    [{ type: "tool_call", call: echoCall }, { type: "done", usage: null }],
    [{ type: "delta", text: "Done." }, { type: "tool_call", call: late }, { type: "done", usage: null }],
  ]);

  const events = await collect(runAnswerLoop({ chat, request, tools: [echoTool(runs)], context }));

  expect(runs).toHaveLength(1);
  expect(events.slice(-2)).toEqual([
    { type: "tool_ignored", call: late },
    { type: "done", usage: null, rounds: 2 },
  ]);
  expect(chat.requests).toHaveLength(2);
});

test("a tool that throws is reported as failed and the model is told nothing was done", async () => {
  const chat = new ScriptedChat([
    [{ type: "tool_call", call: echoCall }, { type: "done", usage: null }],
    [{ type: "delta", text: "Something went wrong." }, { type: "done", usage: null }],
  ]);

  const events = await collect(
    runAnswerLoop({ chat, request, tools: [echoTool([], { fails: true })], context }),
  );

  expect(events[1]).toEqual({
    type: "tool_ended",
    call: echoCall,
    outcome: "failed",
    draftId: null,
    event: null,
    error: "database down",
  });
  expect(JSON.parse(String(chat.requests[1]?.messages[3]?.content))).toMatchObject({
    status: "error",
  });
});

test("a turn stopped before the tool runs drafts nothing", async () => {
  const runs: Echo[] = [];
  const controller = new AbortController();
  const chat = new ScriptedChat([[{ type: "tool_call", call: echoCall }, { type: "done", usage: null }]]);
  controller.abort();

  const loop = runAnswerLoop({
    chat,
    request: { ...request, signal: controller.signal },
    tools: [echoTool(runs)],
    context,
  });

  await expect(collect(loop)).rejects.toMatchObject({ name: "AbortError" });
  expect(runs).toHaveLength(0);
});
