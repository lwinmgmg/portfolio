import { expect, test } from "bun:test";

import { EmailDraftTool } from "@/server/agent/email-draft-tool";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { AgentTool } from "@/server/domain/agent";
import {
  CHAT_REASONING_MAX_CHARS,
  CHAT_SESSION_MESSAGE_LIMIT,
  type ChatEvent,
  type ChatSource,
  type ChatStepDetail,
  type ChatStepName,
  type ChatStepStatus,
  type Conversation,
  type ConversationRepository,
  type EmailDraft,
  type StoredMessage,
} from "@/server/domain/chat";
import type { CvVersion } from "@/server/domain/cv";
import type {
  ChatClient,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  ReasoningLevel,
  ToolCall,
  Usage,
} from "@/server/domain/llm";
import {
  NoActiveRagIndexError,
  RetrievalError,
  type QueryScope,
  type RagIndex,
  type RetrievalConfig,
  type RetrievalRequest,
  type RetrievalResult,
  type RetrievalTrace,
  type RetrievedChunk,
  type TraceStage,
} from "@/server/domain/rag";
import { readyIndex } from "@/server/rag/__fixtures__/fake-retrieval-runner";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import {
  ChatService,
  STOPPED_SUFFIX,
  startOfUtcDay,
  type ChatReplyRequest,
} from "@/server/services/chat-service";

const at = "2026-09-29T08:00:00.000Z";
const now = new Date("2026-09-29T15:30:00.000Z");

class MemoryConversations implements ConversationRepository {
  rows: Conversation[] = [];
  otherUserMessagesToday = 0;
  appendFails = false;
  draftFails = false;
  sinceQueries: Date[] = [];

  ensureReady(): Promise<void> {
    return Promise.resolve();
  }

  async findForSession(id: string, sessionId: string): Promise<Conversation | null> {
    const row = this.rows.find((item) => item.id === id && item.sessionId === sessionId);
    return row ? structuredClone(row) : null;
  }

  async create(sessionId: string): Promise<Conversation> {
    const row: Conversation = {
      id: `conv-${this.rows.length + 1}`,
      sessionId,
      messages: [],
      emailDrafts: [],
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return structuredClone(row);
  }

  async append(id: string, messages: StoredMessage[]): Promise<void> {
    if (this.appendFails) throw new Error("database down");
    const row = this.rows.find((item) => item.id === id);
    if (!row) throw new Error(`no conversation ${id}`);
    row.messages.push(...structuredClone(messages));
  }

  async addEmailDraft(conversationId: string, draft: EmailDraft): Promise<void> {
    if (this.draftFails) throw new Error("database down");
    const row = this.rows.find((item) => item.id === conversationId);
    if (!row) throw new Error(`no conversation ${conversationId}`);
    for (const older of row.emailDrafts) {
      if (older.status === "pending") older.status = "superseded";
    }
    row.emailDrafts.push(structuredClone(draft));
  }

  async countUserMessagesForSession(sessionId: string): Promise<number> {
    return this.rows
      .filter((row) => row.sessionId === sessionId)
      .flatMap((row) => row.messages)
      .filter((message) => message.role === "user").length;
  }

  async countUserMessagesSince(since: Date): Promise<number> {
    this.sinceQueries.push(since);
    const stored = this.rows
      .flatMap((row) => row.messages)
      .filter((message) => message.role === "user" && Date.parse(message.createdAt) >= since.getTime());
    return stored.length + this.otherUserMessagesToday;
  }
}

type ScriptedAnswer = {
  // Yielded as reasoning events before the deltas.
  reasoning?: string[];
  deltas: string[];
  usage?: Usage | null;
  // Throws this error before yielding the delta at `failAt`.
  failAt?: number;
  // Called after each delta is yielded, e.g. to abort the request.
  afterDelta?: (index: number) => void;
  // Yielded after the deltas, as the provider does.
  toolCalls?: ToolCall[];
};

// Each call streams the next script; the last one repeats.
class FakeChat implements ChatClient {
  readonly requests: ChatRequest[] = [];
  private readonly scripts: ScriptedAnswer[];

  constructor(scripts: ScriptedAnswer | ScriptedAnswer[]) {
    this.scripts = Array.isArray(scripts) ? scripts : [scripts];
  }

  complete(): Promise<ChatResult> {
    throw new Error("complete is not used by the chat service");
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const script = this.scripts[Math.min(this.requests.length, this.scripts.length - 1)];
    if (!script) throw new Error("no script");
    this.requests.push(request);
    for (const text of script.reasoning ?? []) yield { type: "reasoning", text };
    for (const [index, text] of script.deltas.entries()) {
      if (request.signal?.aborted) throw new Error("OpenRouter request was aborted");
      if (script.failAt === index) throw new Error("provider exploded");
      yield { type: "delta", text };
      script.afterDelta?.(index);
    }
    if (request.signal?.aborted) throw new Error("OpenRouter request was aborted");
    for (const call of script.toolCalls ?? []) yield { type: "tool_call", call };
    yield { type: "done", usage: script.usage ?? null };
  }
}

function chunk(sourceId: string, entityKey: string, title: string): RetrievedChunk {
  const [section = "profile"] = entityKey.split(":");
  return {
    id: `chunk-${sourceId}`,
    indexId: "index-1",
    ordinal: 0,
    section,
    title,
    entityKeys: [entityKey],
    text: `${title} text`,
    context: null,
    indexText: `${title} indexed`,
    tokenCount: 3,
    fusedScore: 0.5,
    rerankScore: 0.9,
    sourceId,
  };
}

const retrievedChunks = [
  chunk("S1", "experience:acme", "Engineer at Acme"),
  chunk("S2", "project:portfolio", "Portfolio"),
];

// Stage outputs as the pipeline records them. Off-topic and small talk stop after rewrite.
function stagesFor(message: string, scope: QueryScope): TraceStage[] {
  const outputs: [string, unknown][] = [
    ["rewrite", { queries: [message], scope, raw: null }],
    ["embed-queries", { model: "embed-model", count: 1, dimensions: 4 }],
    ["vector-search", { lists: [] }],
    ["lexical-search", { lists: [] }],
    ["fuse", { total: 2, hits: [] }],
    ["rerank", { fallback: false, error: null, hits: [] }],
    ["filter", { minRerankScore: 0.1, kept: 2, dropped: [] }],
  ];
  const run = scope === "cv" ? outputs : outputs.slice(0, 1);
  // Each stage takes 1 ms, one after another.
  return run.map(([name, output], index) => ({
    name,
    input: null,
    output,
    startedAt: index,
    durationMs: 1,
    error: null,
  }));
}

function traceFor(request: RetrievalRequest, id: string, stages: TraceStage[]): RetrievalTrace {
  return {
    id,
    kind: request.kind,
    indexId: "index-1",
    config: request.config,
    stages,
    sources: [],
    totalMs: 10,
    createdAt: at,
  };
}

type SetupOptions = {
  scope?: QueryScope;
  // One script per model call; a single script serves every call.
  answer?: ScriptedAnswer | ScriptedAnswer[];
  // Built with the test's conversations, like the runtime's email tool.
  tools?: (conversations: MemoryConversations) => AgentTool[];
  // The per-turn tools lookup throws, e.g. Mongo is down while reading the Gmail connection.
  toolsFail?: boolean;
  // `stage`: the embed stage fails; `no-index`: the active index is gone by the time it runs.
  retrievalFails?: "stage" | "no-index";
  // Awaited before each stage starts, e.g. to hold the pipeline mid-run.
  beforeStage?: (name: string) => Promise<void> | void;
  activeIndex?: RagIndex | null;
  published?: CvVersion | null;
  dailyMessageLimit?: number;
  answerReasoning?: ReasoningLevel;
  retrievalConfig?: () => Promise<RetrievalConfig>;
  // What a CV question retrieves. Defaults to two chunks.
  chunks?: RetrievedChunk[];
};

function setup(options: SetupOptions = {}) {
  const conversations = new MemoryConversations();
  const retrievals: RetrievalRequest[] = [];
  const saved: RetrievalTrace[] = [];
  const logged: string[] = [];
  const chat = new FakeChat(
    options.answer ?? {
      deltas: ["She built billing at Acme [S1]", " and this site [S2][S9]."],
      usage: { promptTokens: 120, completionTokens: 20, cost: 0.001 },
    },
  );
  let tick = 0;
  const offered = options.tools?.(conversations) ?? null;
  let toolLookups = 0;
  const service = new ChatService({
    conversations,
    pipeline: {
      run: async (request): Promise<RetrievalResult> => {
        retrievals.push(request);
        const id = `trace-${retrievals.length}`;
        if (options.retrievalFails === "no-index") throw new NoActiveRagIndexError();
        const scope = options.scope ?? "cv";
        const recorded: TraceStage[] = [];
        for (const stage of stagesFor(request.message, scope)) {
          await options.beforeStage?.(stage.name);
          request.observer?.stageStarted(stage.name, stage.startedAt);
          const fails = options.retrievalFails === "stage" && stage.name === "embed-queries";
          const ended = fails ? { ...stage, output: null, error: "embedding provider down" } : stage;
          recorded.push(ended);
          request.observer?.stageEnded(ended);
          if (fails) {
            throw new RetrievalError(
              traceFor(request, id, recorded),
              new Error("embedding provider down"),
            );
          }
        }
        return {
          chunks: scope === "cv" ? (options.chunks ?? retrievedChunks) : [],
          scope,
          queries: [request.message],
          trace: traceFor(request, id, recorded),
        };
      },
    },
    retrievalConfig: options.retrievalConfig ?? (async () => ({ ...DEFAULT_RETRIEVAL_CONFIG })),
    indexes: {
      findActive: async () =>
        options.activeIndex === undefined ? readyIndex("index-1") : options.activeIndex,
    },
    cvVersions: {
      findPublished: async () => (options.published === undefined ? published : options.published),
    },
    traces: {
      save: async (trace) => {
        saved.push(trace);
      },
    },
    chat,
    answerModel: "answer-model",
    answerReasoning: options.answerReasoning ?? "low",
    dailyMessageLimit: options.dailyMessageLimit ?? 500,
    ...(offered || options.toolsFail
      ? {
          tools: async () => {
            toolLookups += 1;
            if (options.toolsFail) throw new Error("mongo down");
            return offered ?? [];
          },
        }
      : {}),
    now: () => now,
    // Each reading advances 5 ms.
    clock: () => (tick += 5),
    log: (message) => logged.push(message),
  });
  return { service, conversations, retrievals, saved, logged, chat, toolLookups: () => toolLookups };
}

const published: CvVersion = {
  id: "cv-1",
  status: "published",
  pdf: {
    pathname: "cv/resume.pdf",
    filename: "resume.pdf",
    size: 1,
    contentType: "application/pdf",
    uploadedAt: at,
  },
  extraction: { status: "succeeded", model: "m", error: null, startedAt: at, finishedAt: at },
  data: sampleCv,
  createdAt: at,
  updatedAt: at,
  publishedAt: at,
};

const ask: ChatReplyRequest = {
  sessionId: "session-1",
  conversationId: null,
  message: "  Where did she work?  ",
};

async function collect(events: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const all: ChatEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

function running(name: ChatStepName, startedAt: number): ChatEvent {
  return { type: "step", step: { name, status: "running", startedAt, durationMs: null, detail: null } };
}

function ended(
  name: ChatStepName,
  startedAt: number,
  durationMs: number,
  detail: ChatStepDetail | null,
  status: ChatStepStatus = "done",
): ChatEvent {
  return { type: "step", step: { name, status, startedAt, durationMs, detail } };
}

// Steps as `name:status`, in the order they were sent.
function stepLog(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "step" ? [`${event.step.name}:${event.step.status}`] : [],
  );
}

function withoutSteps(events: readonly ChatEvent[]): ChatEvent[] {
  return events.filter((event) => event.type !== "step");
}

const citedAcme: ChatSource = {
  sourceId: "S1",
  entityKeys: ["experience:acme"],
  title: "Engineer at Acme",
  section: "experience",
  anchor: "#experience-acme",
};

// The fake pipeline's steps for a CV question, one stage per millisecond.
const cvRetrievalSteps: ChatEvent[] = [
  running("rewrite", 0),
  ended("rewrite", 0, 1, {
    kind: "rewrite",
    queries: ["Where did she work?"],
    scope: "cv",
    fallback: false,
  }),
  running("embed-queries", 1),
  ended("embed-queries", 1, 1, { kind: "embed", count: 1, dimensions: 4 }),
  running("vector-search", 2),
  ended("vector-search", 2, 1, { kind: "search", method: "vector", lists: [] }),
  running("lexical-search", 3),
  ended("lexical-search", 3, 1, { kind: "search", method: "bm25", lists: [] }),
  running("fuse", 4),
  ended("fuse", 4, 1, { kind: "fuse", total: 2, hits: [] }),
  running("rerank", 5),
  ended("rerank", 5, 1, { kind: "rerank", fallback: false, hits: [] }),
  running("filter", 6),
  ended("filter", 6, 1, { kind: "filter", minScore: 0.1, kept: 2, dropped: [] }),
];

function messageText(request: ChatRequest | undefined, index: number): string {
  const content = request?.messages[index]?.content;
  if (typeof content !== "string") throw new Error("expected text content");
  return content;
}

test("a CV question streams meta, the retrieval steps, the answer step, deltas, sources and done", async () => {
  const { service } = setup();

  const events = await collect(service.reply(ask));

  // Clock: retrieval returned at 5 and generation ran from 10 to 15, so on the trace timeline
  // (totalMs 10) the answer starts at 15. No reasoning arrived, so there is no reasoning step.
  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    ...cvRetrievalSteps,
    running("generate", 15),
    { type: "delta", text: "She built billing at Acme [S1]" },
    { type: "delta", text: " and this site [S2][S9]." },
    ended("generate", 15, 5, { kind: "generate", sources: 2 }),
    {
      type: "sources",
      sources: [
        citedAcme,
        {
          sourceId: "S2",
          entityKeys: ["project:portfolio"],
          title: "Portfolio",
          section: "project",
          anchor: "#projects-portfolio",
        },
      ],
    },
    { type: "done", messageIndex: 1 },
  ]);
});

test("retrieval runs with the saved config, a chat trace, the trimmed message and an observer", async () => {
  const saved = { ...DEFAULT_RETRIEVAL_CONFIG, finalK: 3, minRerankScore: 0.2 };
  const { service, retrievals } = setup({ retrievalConfig: async () => saved });

  await collect(service.reply(ask));

  expect(retrievals).toHaveLength(1);
  const { observer, ...request } = retrievals[0] ?? {};
  expect(request).toEqual({
    message: "Where did she work?",
    history: [],
    config: saved,
    subjectName: "Jane Doe",
    kind: "chat",
  });
  expect(observer === undefined).toBe(false);
});

test("the config is read once per turn, so a saved change applies to the next turn", async () => {
  let current: RetrievalConfig = { ...DEFAULT_RETRIEVAL_CONFIG };
  let reads = 0;
  const { service, retrievals } = setup({
    retrievalConfig: async () => {
      reads += 1;
      return current;
    },
  });

  await collect(service.reply(ask));
  current = { ...DEFAULT_RETRIEVAL_CONFIG, minRerankScore: 0.3 };
  await collect(service.reply({ ...ask, conversationId: "conv-1" }));

  expect(reads).toBe(2);
  expect(retrievals.map((request) => request.config.minRerankScore)).toEqual([0, 0.3]);
});

test("a CV question with no chunks gets the no-information reply without an LLM call", async () => {
  const { service, chat, conversations, saved } = setup({ chunks: [] });

  const events = await collect(service.reply(ask));

  const reply = "I don't have that information in Jane Doe's CV. You can contact Jane Doe directly.";
  expect(withoutSteps(events)).toEqual([
    { type: "meta", conversationId: "conv-1" },
    { type: "delta", text: reply },
    { type: "sources", sources: [] },
    { type: "done", messageIndex: 1 },
  ]);
  expect(stepLog(events).some((step) => step.startsWith("generate"))).toBe(false);
  expect(chat.requests).toHaveLength(0);
  expect(conversations.rows[0]?.messages.map((message) => message.text)).toEqual([
    "Where did she work?",
    reply,
  ]);
  expect(conversations.rows[0]?.messages[1]?.traceId).toBe("trace-1");
  expect(saved).toHaveLength(1);
  expect(saved[0]?.stages.map((stage) => stage.name)).not.toContain("generate");
});

test("steps are sent while the pipeline is still running", async () => {
  const hold = Promise.withResolvers<void>();
  const { service } = setup({
    beforeStage: (name) => (name === "embed-queries" ? hold.promise : undefined),
  });
  const events = service.reply(ask);

  expect((await events.next()).value).toMatchObject({ type: "meta" });
  expect((await events.next()).value).toEqual(cvRetrievalSteps[0]);
  expect((await events.next()).value).toEqual(cvRetrievalSteps[1]);
  hold.resolve();
  const rest = await collect({ [Symbol.asyncIterator]: () => events });

  expect(stepLog(rest).slice(0, 2)).toEqual(["embed-queries:running", "embed-queries:done"]);
  expect(rest.at(-1)).toEqual({ type: "done", messageIndex: 1 });
});

test("the answer model gets the answer settings and the sources in the final turn", async () => {
  const { service, chat } = setup();

  await collect(service.reply(ask));

  const [request] = chat.requests;
  expect(request?.model).toBe("answer-model");
  expect(request?.reasoning).toEqual({ effort: "low" });
  expect(request?.maxTokens).toBe(1600);
  expect(request?.temperature).toBe(0.2);
  expect(request?.messages.map((message) => message.role)).toEqual(["system", "user"]);
  expect(messageText(request, 1)).toContain('<source id="S1" section="experience"');
  expect(messageText(request, 1)).toContain("<question>Where did she work?</question>");
});

test("answer reasoning off disables reasoning and keeps the answer budget", async () => {
  const { service, chat } = setup({ answerReasoning: "off" });

  await collect(service.reply(ask));

  expect(chat.requests[0]?.reasoning).toEqual({ enabled: false });
  expect(chat.requests[0]?.maxTokens).toBe(600);
});

test("reasoning streams in its own step before the answer and is not part of the answer", async () => {
  const { service, conversations, saved } = setup({
    answer: { reasoning: ["Sources say", " Acme."], deltas: ["She worked at Acme [S1]."] },
  });

  const events = await collect(service.reply(ask));

  // Clock: asked at 10 (15 on the timeline); the first delta at 15 ends reasoning; done at 20.
  expect(events.slice(1 + cvRetrievalSteps.length)).toEqual([
    running("reasoning", 15),
    { type: "reasoning", text: "Sources say" },
    { type: "reasoning", text: " Acme." },
    ended("reasoning", 15, 5, { kind: "reasoning" }),
    running("generate", 20),
    { type: "delta", text: "She worked at Acme [S1]." },
    ended("generate", 20, 5, { kind: "generate", sources: 2 }),
    { type: "sources", sources: [citedAcme] },
    { type: "done", messageIndex: 1 },
  ]);
  expect(conversations.rows[0]?.messages[1]?.text).toBe("She worked at Acme [S1].");
  // The trace's generate stage covers the reasoning too.
  expect(saved[0]?.stages.at(-1)).toMatchObject({
    name: "generate",
    output: { answer: "She worked at Acme [S1].", reasoning: "Sources say Acme." },
    startedAt: 15,
    durationMs: 10,
  });
});

test("an answer without reasoning has no reasoning step and stores null reasoning", async () => {
  const { service, saved } = setup();

  const events = await collect(service.reply(ask));

  expect(events.some((event) => event.type === "reasoning")).toBe(false);
  expect(stepLog(events)).not.toContain("reasoning:running");
  expect(saved[0]?.stages.at(-1)?.output).toMatchObject({ reasoning: null });
});

test("the trace keeps at most CHAT_REASONING_MAX_CHARS of reasoning; the visitor gets it all", async () => {
  const long = "r".repeat(CHAT_REASONING_MAX_CHARS);
  const { service, saved } = setup({
    answer: { reasoning: [long, "tail"], deltas: ["Acme [S1]."] },
  });

  const events = await collect(service.reply(ask));

  const streamed = events.flatMap((event) => (event.type === "reasoning" ? [event.text] : []));
  expect(streamed.join("")).toBe(`${long}tail`);
  expect(saved[0]?.stages.at(-1)?.output).toMatchObject({ reasoning: long });
});

test("reasoning with no answer text still ends in a finished generate step", async () => {
  const { service } = setup({ answer: { reasoning: ["Nothing to say."], deltas: [] } });

  const events = await collect(service.reply(ask));

  expect(stepLog(events).slice(-4)).toEqual([
    "reasoning:running",
    "reasoning:done",
    "generate:running",
    "generate:done",
  ]);
  expect(events.at(-1)).toEqual({ type: "done", messageIndex: 1 });
});

test("the turn is stored with cited entity keys and the trace id", async () => {
  const { service, conversations } = setup();

  await collect(service.reply(ask));

  expect(conversations.rows[0]?.messages).toEqual([
    {
      role: "user",
      text: "Where did she work?",
      citedEntityKeys: [],
      traceId: null,
      feedback: null,
      createdAt: now.toISOString(),
    },
    {
      role: "assistant",
      text: "She built billing at Acme [S1] and this site [S2][S9].",
      citedEntityKeys: ["experience:acme", "project:portfolio"],
      traceId: "trace-1",
      feedback: null,
      createdAt: now.toISOString(),
    },
  ]);
});

test("the saved trace gains a generate stage after retrieval", async () => {
  const { service, saved } = setup();

  await collect(service.reply(ask));

  expect(saved).toHaveLength(1);
  const trace = saved[0];
  expect(trace?.kind).toBe("chat");
  expect(trace?.stages.map((stage) => stage.name)).toEqual([
    "rewrite",
    "embed-queries",
    "vector-search",
    "lexical-search",
    "fuse",
    "rerank",
    "filter",
    "generate",
  ]);
  // Clock: retrieval returned at 5, generation ran from 10 to 15; the pipeline's total was 10.
  expect(trace?.stages.at(-1)).toEqual({
    name: "generate",
    input: {
      model: "answer-model",
      mode: "cv",
      sources: 2,
      historyTurns: 0,
      tools: [],
      pendingDraft: false,
    },
    output: {
      model: "answer-model",
      usage: { promptTokens: 120, completionTokens: 20, cost: 0.001 },
      answer: "She built billing at Acme [S1] and this site [S2][S9].",
      stopped: false,
      citedSourceIds: ["S1", "S2"],
      reasoning: null,
      rounds: 1,
    },
    startedAt: 15,
    durationMs: 5,
    error: null,
  });
  expect(trace?.totalMs).toBe(20);
});

test("a blank or too long message is rejected before any lookup", async () => {
  const { service, conversations, retrievals } = setup();

  expect(await collect(service.reply({ ...ask, message: "   " }))).toEqual([
    { type: "error", code: "invalid_message" },
  ]);
  expect(await collect(service.reply({ ...ask, message: "x".repeat(501) }))).toEqual([
    { type: "error", code: "invalid_message" },
  ]);
  expect(conversations.sinceQueries).toHaveLength(0);
  expect(retrievals).toHaveLength(0);
});

test("a 500-character message is accepted", async () => {
  const { service } = setup();

  const events = await collect(service.reply({ ...ask, message: "x".repeat(500) }));

  expect(events[0]?.type).toBe("meta");
});

test("the session limit stops the 21st message", async () => {
  const { service, conversations, retrievals } = setup();
  const userMessage: StoredMessage = {
    role: "user",
    text: "q",
    citedEntityKeys: [],
    traceId: null,
    feedback: null,
    createdAt: at,
  };
  conversations.rows.push({
    id: "conv-old",
    sessionId: "session-1",
    messages: Array.from({ length: CHAT_SESSION_MESSAGE_LIMIT - 1 }, () => ({ ...userMessage })),
    emailDrafts: [],
    createdAt: at,
    updatedAt: at,
  });

  expect((await collect(service.reply(ask)))[0]?.type).toBe("meta");
  expect(await collect(service.reply(ask))).toEqual([{ type: "limit", code: "session_limit" }]);
  expect(retrievals).toHaveLength(1);
});

test("the daily limit counts user messages since the start of the UTC day", async () => {
  const { service, conversations, retrievals } = setup({ dailyMessageLimit: 3 });
  conversations.otherUserMessagesToday = 3;

  expect(await collect(service.reply(ask))).toEqual([{ type: "limit", code: "daily_limit" }]);
  expect(conversations.sinceQueries).toEqual([new Date("2026-09-29T00:00:00.000Z")]);
  expect(conversations.rows).toHaveLength(0);
  expect(retrievals).toHaveLength(0);
});

test("without an active index or a published name the chat is unavailable", async () => {
  for (const options of [{ activeIndex: null }, { published: null }] satisfies SetupOptions[]) {
    const { service, conversations, retrievals } = setup(options);

    expect(await collect(service.reply(ask))).toEqual([{ type: "error", code: "unavailable" }]);
    expect(conversations.rows).toHaveLength(0);
    expect(retrievals).toHaveLength(0);
  }
});

test("an off-topic message gets the fixed reply without an LLM call", async () => {
  const { service, chat, conversations, saved } = setup({ scope: "off_topic" });

  const events = await collect(service.reply(ask));

  const reply =
    "I can only answer questions about Jane Doe's experience, skills and background. " +
    "If you'd like Jane Doe's help with something, you can contact Jane Doe directly.";
  // Retrieval stops after rewrite, whose detail shows why; there is no generate step.
  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    running("rewrite", 0),
    ended("rewrite", 0, 1, {
      kind: "rewrite",
      queries: ["Where did she work?"],
      scope: "off_topic",
      fallback: false,
    }),
    { type: "delta", text: reply },
    { type: "sources", sources: [] },
    { type: "done", messageIndex: 1 },
  ]);
  expect(chat.requests).toHaveLength(0);
  expect(conversations.rows[0]?.messages.map((message) => message.text)).toEqual([
    "Where did she work?",
    reply,
  ]);
  expect(saved.map((trace) => trace.stages.map((stage) => stage.name))).toEqual([["rewrite"]]);
});

test("small talk gets the fixed reply without an LLM call", async () => {
  const { service, chat, conversations, saved } = setup({ scope: "smalltalk" });

  const events = await collect(service.reply({ ...ask, message: "Hello" }));

  const reply =
    "Happy to help! I answer questions about Jane Doe's experience, projects, skills and " +
    "education. What would you like to know?";
  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    running("rewrite", 0),
    ended("rewrite", 0, 1, { kind: "rewrite", queries: ["Hello"], scope: "smalltalk", fallback: false }),
    { type: "delta", text: reply },
    { type: "sources", sources: [] },
    { type: "done", messageIndex: 1 },
  ]);
  expect(chat.requests).toHaveLength(0);
  expect(conversations.rows[0]?.messages.map((message) => message.text)).toEqual(["Hello", reply]);
  expect(saved.map((trace) => trace.stages.map((stage) => stage.name))).toEqual([["rewrite"]]);
});

test("a conversation continues only for the session that owns it", async () => {
  const { service, conversations, retrievals, chat } = setup();
  const first = await collect(service.reply(ask));
  const conversationId = first[0]?.type === "meta" ? first[0].conversationId : "";

  const own = await collect(
    service.reply({ ...ask, conversationId, message: "What about before that?" }),
  );
  const stolen = await collect(
    service.reply({ ...ask, sessionId: "session-2", conversationId, message: "Hi" }),
  );

  expect(own[0]).toEqual({ type: "meta", conversationId });
  expect(stolen[0]).toEqual({ type: "meta", conversationId: "conv-2" });
  expect(conversations.rows[0]?.messages).toHaveLength(4);
  expect(conversations.rows[1]?.sessionId).toBe("session-2");
  expect(retrievals[1]?.history).toEqual([
    { role: "user", text: "Where did she work?" },
    { role: "assistant", text: "She built billing at Acme [S1] and this site [S2][S9]." },
  ]);
  expect(retrievals[2]?.history).toEqual([]);
  // The earlier answer goes back as plain text: no sources and no stale markers.
  expect(chat.requests[1]?.messages.map((message) => message.role)).toEqual([
    "system",
    "user",
    "assistant",
    "user",
  ]);
  expect(messageText(chat.requests[1], 2)).toBe("She built billing at Acme and this site.");
  expect(messageText(chat.requests[1], 1)).toBe("Where did she work?");
});

test("a retrieval failure sends the failed step, saves the partial trace and stores no messages", async () => {
  const { service, conversations, saved, chat, logged } = setup({ retrievalFails: "stage" });

  const events = await collect(service.reply(ask));

  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    ...cvRetrievalSteps.slice(0, 3),
    ended("embed-queries", 1, 1, null, "failed"),
    { type: "error", code: "unavailable" },
  ]);
  expect(JSON.stringify(events)).not.toContain("embedding provider down");
  expect(saved.map((trace) => trace.stages.map((stage) => stage.error))).toEqual([
    [null, "embedding provider down"],
  ]);
  expect(conversations.rows[0]?.messages).toEqual([]);
  expect(chat.requests).toHaveLength(0);
  expect(logged).toEqual(["Chat retrieval failed."]);
});

test("an index that disappears after the check is unavailable, not a crash", async () => {
  const { service, saved } = setup({ retrievalFails: "no-index" });

  expect(await collect(service.reply(ask))).toEqual([
    { type: "meta", conversationId: "conv-1" },
    { type: "error", code: "unavailable" },
  ]);
  expect(saved).toHaveLength(0);
});

test("a provider failure fails the generate step, then errors, and records it on the stage", async () => {
  const { service, conversations, saved, logged } = setup({
    answer: { deltas: ["Partial", " answer"], failAt: 1 },
  });

  const events = await collect(service.reply(ask));

  expect(events.slice(1 + cvRetrievalSteps.length)).toEqual([
    running("generate", 15),
    { type: "delta", text: "Partial" },
    ended("generate", 15, 5, null, "failed"),
    { type: "error", code: "unavailable" },
  ]);
  expect(JSON.stringify(events)).not.toContain("provider exploded");
  expect(conversations.rows[0]?.messages).toEqual([]);
  expect(saved[0]?.stages.at(-1)?.error).toBe("provider exploded");
  expect(saved[0]?.stages.at(-1)?.output).toMatchObject({ answer: "Partial", stopped: false });
  expect(logged).toEqual(["Chat answer failed."]);
});

test("a provider failure while reasoning fails the reasoning step", async () => {
  const { service, saved } = setup({
    answer: { reasoning: ["Let me see."], deltas: ["Never sent"], failAt: 0 },
  });

  const events = await collect(service.reply(ask));

  expect(events.slice(1 + cvRetrievalSteps.length)).toEqual([
    running("reasoning", 15),
    { type: "reasoning", text: "Let me see." },
    ended("reasoning", 15, 5, null, "failed"),
    { type: "error", code: "unavailable" },
  ]);
  expect(saved[0]?.stages.at(-1)?.output).toMatchObject({ answer: "", reasoning: "Let me see." });
});

test("a provider failure before any output still reports a failed generate step", async () => {
  const { service } = setup({ answer: { deltas: ["Never sent"], failAt: 0 } });

  const events = await collect(service.reply(ask));

  expect(events.slice(1 + cvRetrievalSteps.length)).toEqual([
    ended("generate", 15, 5, null, "failed"),
    { type: "error", code: "unavailable" },
  ]);
});

test("an aborted request stores the partial answer with the stopped suffix", async () => {
  const controller = new AbortController();
  const { service, conversations, saved } = setup({
    answer: {
      deltas: ["She worked at Acme [S1] ", "and more."],
      afterDelta: (index) => {
        if (index === 0) controller.abort();
      },
    },
  });

  const events = await collect(service.reply({ ...ask, signal: controller.signal }));

  // The running generate step is left as it is; the client marks it stopped.
  expect(withoutSteps(events).map((event) => event.type)).toEqual(["meta", "delta"]);
  expect(stepLog(events).at(-1)).toBe("generate:running");
  expect(conversations.rows[0]?.messages[1]).toMatchObject({
    role: "assistant",
    text: `She worked at Acme [S1] ${STOPPED_SUFFIX}`,
    citedEntityKeys: ["experience:acme"],
    traceId: "trace-1",
  });
  expect(saved[0]?.stages.at(-1)?.output).toMatchObject({ stopped: true });
  expect(saved[0]?.stages.at(-1)?.error).toBeNull();
});

// Reads events up to and including the first one of `type`.
async function readUntil(events: AsyncGenerator<ChatEvent>, type: ChatEvent["type"]) {
  for (;;) {
    const next = await events.next();
    if (next.done) throw new Error(`the stream ended before a ${type} event`);
    if (next.value.type === type) return next.value;
  }
}

test("a reader that stops mid-answer still gets the partial answer stored", async () => {
  const { service, conversations, saved } = setup();
  const events = service.reply(ask);

  await readUntil(events, "delta");
  await events.return();

  expect(conversations.rows[0]?.messages[1]?.text).toBe(
    `She built billing at Acme [S1] ${STOPPED_SUFFIX}`,
  );
  expect(saved).toHaveLength(1);
});

test("a reader that stops mid-reasoning stores a stopped turn and the reasoning so far", async () => {
  const { service, conversations, saved } = setup({
    answer: { reasoning: ["First thought.", " Second."], deltas: ["Acme [S1]."] },
  });
  const events = service.reply(ask);

  expect(await readUntil(events, "reasoning")).toEqual({ type: "reasoning", text: "First thought." });
  await events.return();

  expect(conversations.rows[0]?.messages[1]?.text).toBe(STOPPED_SUFFIX);
  expect(saved[0]?.stages.at(-1)?.output).toMatchObject({
    answer: "",
    stopped: true,
    reasoning: "First thought.",
  });
});

test("a reader that stops mid-retrieval stores nothing, waits for the pipeline and saves its trace", async () => {
  const hold = Promise.withResolvers<void>();
  const { service, conversations, saved, chat } = setup({
    beforeStage: (name) => (name === "fuse" ? hold.promise : undefined),
  });
  const events = service.reply(ask);

  await readUntil(events, "step");
  const closing = events.return();
  hold.resolve();
  await closing;

  expect(conversations.rows[0]?.messages).toEqual([]);
  expect(chat.requests).toHaveLength(0);
  expect(saved.map((trace) => trace.stages.length)).toEqual([7]);
});

test("a reader that stops mid-retrieval before a stage fails still saves the partial trace", async () => {
  const hold = Promise.withResolvers<void>();
  const { service, saved, logged } = setup({
    retrievalFails: "stage",
    beforeStage: (name) => (name === "embed-queries" ? hold.promise : undefined),
  });
  const events = service.reply(ask);

  await readUntil(events, "step");
  const closing = events.return();
  hold.resolve();
  await closing;

  expect(saved.map((trace) => trace.stages.map((stage) => stage.name))).toEqual([
    ["rewrite", "embed-queries"],
  ]);
  expect(logged).toEqual(["Chat retrieval failed."]);
});

test("a request aborted during retrieval ends after the steps, stores nothing and saves the trace", async () => {
  const controller = new AbortController();
  const { service, conversations, saved, chat } = setup({
    beforeStage: (name) => {
      if (name === "filter") controller.abort();
    },
  });

  const events = await collect(service.reply({ ...ask, signal: controller.signal }));

  expect(events).toEqual([{ type: "meta", conversationId: "conv-1" }, ...cvRetrievalSteps]);
  expect(conversations.rows[0]?.messages).toEqual([]);
  expect(chat.requests).toHaveLength(0);
  expect(saved).toHaveLength(1);
});

test("storage failures are logged and the stream still finishes", async () => {
  const { service, conversations, logged } = setup();
  conversations.appendFails = true;

  const events = await collect(service.reply(ask));

  expect(events.at(-1)).toEqual({ type: "done", messageIndex: null });
  expect(logged).toEqual(["Could not store the chat messages."]);
});

// ---- Tools (Phase 4.3) ----

const contactAsk: ChatReplyRequest = {
  sessionId: "session-1",
  conversationId: null,
  message: "Please tell her I'd like to talk. I'm Sam, sam@example.com",
};

const draftText = "Hi Jane, I'm Sam (sam@example.com) and I'd like to talk about a backend role.";

function sendEmailCall(text: string = draftText, id = "call-1"): ToolCall {
  return { id, name: "send_email", arguments: JSON.stringify({ text }) };
}

const emailTool = (conversations: MemoryConversations): AgentTool[] => {
  let drafts = 0;
  return [new EmailDraftTool(conversations, () => `draft-${(drafts += 1)}`)];
};

// Round 1 calls the tool; round 2 answers.
const draftingAnswer: ScriptedAnswer[] = [
  { reasoning: ["Sam gave a name and an email."], deltas: [], toolCalls: [sendEmailCall()] },
  {
    deltas: ["I've drafted a message to Jane Doe. ", "Check it and press Send."],
    usage: { promptTokens: 300, completionTokens: 20, cost: null },
  },
];

function toolStages(trace: RetrievalTrace | undefined): TraceStage[] {
  return trace?.stages.filter((stage) => stage.name === "tool") ?? [];
}

test("a contact turn yields the tool steps, the draft, then round 2's answer and done", async () => {
  const { service, chat, conversations, saved } = setup({
    scope: "contact",
    tools: emailTool,
    answer: draftingAnswer,
  });

  const events = await collect(service.reply(contactAsk));

  // Clock: asked at 10 (15 on the timeline); the tool ran from 15 to 20; round 2's first text
  // at 20; done at 25.
  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    running("rewrite", 0),
    ended("rewrite", 0, 1, {
      kind: "rewrite",
      queries: [contactAsk.message],
      scope: "contact",
      fallback: false,
    }),
    running("reasoning", 15),
    { type: "reasoning", text: "Sam gave a name and an email." },
    ended("reasoning", 15, 5, { kind: "reasoning" }),
    running("tool", 20),
    ended("tool", 20, 5, { kind: "tool", name: "send_email", outcome: "drafted" }),
    { type: "email_draft", draft: { id: "draft-1", text: draftText } },
    running("generate", 25),
    { type: "delta", text: "I've drafted a message to Jane Doe. " },
    { type: "delta", text: "Check it and press Send." },
    ended("generate", 25, 5, { kind: "generate", sources: 0 }),
    { type: "sources", sources: [] },
    { type: "done", messageIndex: 1 },
  ]);

  // Round 1 offered the tool; round 2 saw the call and its result, with the tool on `none`.
  expect(chat.requests).toHaveLength(2);
  expect(chat.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["send_email"]);
  expect(chat.requests[0]?.toolChoice).toBe("auto");
  expect(chat.requests[1]?.toolChoice).toBe("none");
  expect(chat.requests[1]?.messages.slice(-2).map((message) => message.role)).toEqual([
    "assistant",
    "tool",
  ]);

  // The draft is stored on the conversation; the history keeps only the text.
  const row = conversations.rows[0];
  expect(row?.emailDrafts).toEqual([
    {
      id: "draft-1",
      text: draftText,
      status: "pending",
      createdAt: now.toISOString(),
      sentAt: null,
    },
  ]);
  expect(row?.messages.map((message) => message.text)).toEqual([
    contactAsk.message,
    "I've drafted a message to Jane Doe. Check it and press Send.",
  ]);

  // The trace: generate covers both rounds, then the tool stage with the raw arguments.
  const trace = saved[0];
  expect(trace?.stages.map((stage) => stage.name)).toEqual(["rewrite", "generate", "tool"]);
  expect(trace?.stages[1]).toMatchObject({
    input: { mode: "contact", sources: 0, tools: ["send_email"], pendingDraft: false },
    output: { rounds: 2, reasoning: "Sam gave a name and an email." },
    startedAt: 15,
    durationMs: 15,
  });
  expect(trace?.stages[2]).toEqual({
    name: "tool",
    input: { name: "send_email", arguments: JSON.stringify({ text: draftText }) },
    output: { outcome: "drafted", draftId: "draft-1" },
    startedAt: 20,
    durationMs: 5,
    error: null,
  });
});

test("the contact prompt has the tool rules and no sources", async () => {
  const { service, chat } = setup({ scope: "contact", tools: emailTool, answer: draftingAnswer });

  await collect(service.reply(contactAsk));

  const system = messageText(chat.requests[0], 0);
  expect(system).toContain("The send_email tool drafts an email to Jane Doe.");
  expect(system).toContain("Never say or suggest that a message was sent.");
  expect(messageText(chat.requests[0], 1)).toBe(`<message>${contactAsk.message}</message>`);
});

test("a CV question with tools offered keeps its sources and adds the tool rules", async () => {
  const { service, chat } = setup({ tools: emailTool });

  const events = await collect(service.reply(ask));

  expect(events.at(-1)).toEqual({ type: "done", messageIndex: 1 });
  expect(chat.requests).toHaveLength(1);
  expect(chat.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["send_email"]);
  expect(messageText(chat.requests[0], 0)).toContain("Messages to Jane Doe:");
  expect(messageText(chat.requests[0], 1)).toContain('<source id="S1"');
  expect(messageText(chat.requests[0], 1)).not.toContain("<pending_email_draft>");
});

test("without email configured no tools are offered and a contact request gets a fixed reply", async () => {
  const cv = setup();
  await collect(cv.service.reply(ask));
  expect(Object.keys(cv.chat.requests[0] ?? {})).not.toContain("tools");
  expect(messageText(cv.chat.requests[0], 0)).not.toContain("send_email");

  const contact = setup({ scope: "contact" });
  const events = await collect(contact.service.reply(contactAsk));
  const reply =
    "I can't pass messages on from this chat. You can contact Jane Doe directly with the details on this page.";
  expect(withoutSteps(events)).toEqual([
    { type: "meta", conversationId: "conv-1" },
    { type: "delta", text: reply },
    { type: "sources", sources: [] },
    { type: "done", messageIndex: 1 },
  ]);
  expect(contact.chat.requests).toHaveLength(0);
  expect(contact.saved[0]?.stages.map((stage) => stage.name)).toEqual(["rewrite"]);
});

test("tools are looked up on each turn that could use them, and only then", async () => {
  const cv = setup({ tools: emailTool });
  await collect(cv.service.reply(ask));
  await collect(cv.service.reply(ask));
  expect(cv.toolLookups()).toBe(2);

  const smalltalk = setup({ scope: "smalltalk", tools: emailTool });
  await collect(smalltalk.service.reply(ask));
  expect(smalltalk.toolLookups()).toBe(0);
});

test("a failed tools lookup is logged and the turn goes on without tools", async () => {
  const contact = setup({ scope: "contact", toolsFail: true });
  const events = await collect(contact.service.reply(contactAsk));
  expect(withoutSteps(events)[1]).toEqual({
    type: "delta",
    text: "I can't pass messages on from this chat. You can contact Jane Doe directly with the details on this page.",
  });
  expect(contact.chat.requests).toHaveLength(0);
  expect(contact.logged).toEqual(["Chat tools lookup failed."]);

  const cv = setup({ toolsFail: true });
  await collect(cv.service.reply(ask));
  expect(Object.keys(cv.chat.requests[0] ?? {})).not.toContain("tools");
  expect(cv.logged).toEqual(["Chat tools lookup failed."]);
});

test("off topic and small talk keep their fixed replies with tools offered", async () => {
  for (const scope of ["off_topic", "smalltalk"] satisfies QueryScope[]) {
    const { service, chat, conversations } = setup({ scope, tools: emailTool });

    const events = await collect(service.reply(ask));

    expect(events.at(-1)).toEqual({ type: "done", messageIndex: 1 });
    expect(chat.requests).toHaveLength(0);
    expect(conversations.rows[0]?.emailDrafts).toEqual([]);
  }
});

test("invalid arguments draft nothing; the step says so and round 2 still answers", async () => {
  const { service, conversations, saved } = setup({
    scope: "contact",
    tools: emailTool,
    answer: [
      { deltas: [], toolCalls: [sendEmailCall("   ")] },
      { deltas: ["I couldn't draft that. What should the message say?"] },
    ],
  });

  const events = await collect(service.reply(contactAsk));

  expect(events.some((event) => event.type === "email_draft")).toBe(false);
  const toolStep = events.find((event) => event.type === "step" && event.step.status === "done" && event.step.name === "tool");
  expect(toolStep).toMatchObject({ step: { detail: { kind: "tool", name: "send_email", outcome: "invalid" } } });
  expect(events.at(-1)).toEqual({ type: "done", messageIndex: 1 });
  expect(conversations.rows[0]?.emailDrafts).toEqual([]);
  expect(toolStages(saved[0]).map((stage) => stage.output)).toEqual([
    { outcome: "invalid", draftId: null },
  ]);
});

test("an unknown tool and a second call are only in the trace; one tool step is shown", async () => {
  const { service, conversations, saved } = setup({
    scope: "contact",
    tools: emailTool,
    answer: [
      {
        deltas: [],
        toolCalls: [
          { id: "call-1", name: "wire_money", arguments: "{}" },
          sendEmailCall(draftText, "call-2"),
        ],
      },
      { deltas: ["I can only draft messages."] },
    ],
  });

  const events = await collect(service.reply(contactAsk));

  expect(stepLog(events).filter((step) => step.startsWith("tool"))).toEqual([
    "tool:running",
    "tool:done",
  ]);
  expect(conversations.rows[0]?.emailDrafts).toEqual([]);
  expect(toolStages(saved[0]).map((stage) => [stage.input, stage.output])).toEqual([
    [{ name: "wire_money", arguments: "{}" }, { outcome: "unknown_tool", draftId: null }],
    [
      { name: "send_email", arguments: JSON.stringify({ text: draftText }) },
      { outcome: "ignored", draftId: null },
    ],
  ]);
});

test("a tool that fails is logged, its step fails, and the answer still finishes", async () => {
  const { service, conversations, saved, logged } = setup({
    scope: "contact",
    tools: emailTool,
    answer: draftingAnswer,
  });
  conversations.draftFails = true;

  const events = await collect(service.reply(contactAsk));

  expect(stepLog(events).filter((step) => step.startsWith("tool"))).toEqual([
    "tool:running",
    "tool:failed",
  ]);
  expect(events.some((event) => event.type === "email_draft")).toBe(false);
  expect(events.at(-1)).toEqual({ type: "done", messageIndex: 1 });
  expect(logged).toEqual(["Chat tool failed."]);
  expect(toolStages(saved[0])[0]).toMatchObject({
    output: { outcome: "failed", draftId: null },
    error: "database down",
  });
});

test("a new draft supersedes the pending one, which reaches the next prompt", async () => {
  const { service, chat, conversations } = setup({
    scope: "contact",
    tools: emailTool,
    answer: [
      ...draftingAnswer,
      { deltas: [], toolCalls: [sendEmailCall("Hi Jane, I'm Sam. Could we talk on Friday?")] },
      { deltas: ["I've updated the draft. Check it and press Send."] },
    ],
  });

  await collect(service.reply(contactAsk));
  await collect(
    service.reply({ ...contactAsk, conversationId: "conv-1", message: "Ask for Friday instead." }),
  );

  expect(conversations.rows[0]?.emailDrafts.map((draft) => [draft.id, draft.status])).toEqual([
    ["draft-1", "superseded"],
    ["draft-2", "pending"],
  ]);
  const retry = chat.requests[2];
  expect(messageText(retry, retry ? retry.messages.length - 1 : 0)).toBe(
    `<pending_email_draft>${draftText}</pending_email_draft>\n\n<message>Ask for Friday instead.</message>`,
  );
});

test("a draft that is sent, superseded or over an hour old is not in the prompt", async () => {
  const { service, chat, conversations } = setup({ scope: "contact", tools: emailTool, answer: { deltas: ["Ok."] } });
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const cases: EmailDraft[] = [
    { id: "d", text: "old", status: "pending", createdAt: hourAgo, sentAt: null },
    { id: "d", text: "sent", status: "sent", createdAt: now.toISOString(), sentAt: now.toISOString() },
  ];
  for (const [index, draft] of cases.entries()) {
    conversations.rows.push({
      id: `conv-old-${index}`,
      sessionId: "session-1",
      messages: [],
      emailDrafts: [draft],
      createdAt: at,
      updatedAt: at,
    });
    await collect(service.reply({ ...contactAsk, conversationId: `conv-old-${index}` }));
  }

  for (const request of chat.requests) {
    expect(messageText(request, request.messages.length - 1)).not.toContain("<pending_email_draft>");
  }
  expect(chat.requests).toHaveLength(2);
});

test("stopping during round 2 keeps the draft and stores the partial answer", async () => {
  const controller = new AbortController();
  const { service, conversations } = setup({
    scope: "contact",
    tools: emailTool,
    answer: [
      draftingAnswer[0] ?? { deltas: [] },
      { deltas: ["I've drafted", " a message."], afterDelta: () => controller.abort() },
    ],
  });

  const events = await collect(service.reply({ ...contactAsk, signal: controller.signal }));

  expect(events.some((event) => event.type === "email_draft")).toBe(true);
  expect(events.at(-1)).toEqual({ type: "delta", text: "I've drafted" });
  expect(conversations.rows[0]?.emailDrafts[0]?.status).toBe("pending");
  expect(conversations.rows[0]?.messages[1]?.text).toBe(`I've drafted ${STOPPED_SUFFIX}`);
});

test("startOfUtcDay truncates to midnight UTC", () => {
  expect(startOfUtcDay(new Date("2026-09-29T23:59:59.999-05:00"))).toEqual(
    new Date("2026-09-30T00:00:00.000Z"),
  );
});
