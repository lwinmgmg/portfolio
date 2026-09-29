import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import {
  CHAT_SESSION_MESSAGE_LIMIT,
  type ChatEvent,
  type Conversation,
  type ConversationRepository,
  type StoredMessage,
} from "@/server/domain/chat";
import type { CvVersion } from "@/server/domain/cv";
import type {
  ChatClient,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  ReasoningLevel,
  Usage,
} from "@/server/domain/llm";
import {
  NoActiveRagIndexError,
  RetrievalError,
  type QueryScope,
  type RagIndex,
  type RetrievalRequest,
  type RetrievalResult,
  type RetrievalTrace,
  type RetrievedChunk,
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
};

class FakeChat implements ChatClient {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly script: ScriptedAnswer) {}

  complete(): Promise<ChatResult> {
    throw new Error("complete is not used by the chat service");
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    this.requests.push(request);
    for (const text of this.script.reasoning ?? []) yield { type: "reasoning", text };
    for (const [index, text] of this.script.deltas.entries()) {
      if (request.signal?.aborted) throw new Error("OpenRouter request was aborted");
      if (this.script.failAt === index) throw new Error("provider exploded");
      yield { type: "delta", text };
      this.script.afterDelta?.(index);
    }
    if (request.signal?.aborted) throw new Error("OpenRouter request was aborted");
    yield { type: "done", usage: this.script.usage ?? null };
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

function traceFor(request: RetrievalRequest, id: string): RetrievalTrace {
  return {
    id,
    kind: request.kind,
    indexId: "index-1",
    config: request.config,
    stages: [
      { name: "rewrite", input: null, output: null, startedAt: 0, durationMs: 4, error: null },
    ],
    sources: [],
    totalMs: 10,
    createdAt: at,
  };
}

type SetupOptions = {
  scope?: QueryScope;
  answer?: ScriptedAnswer;
  // `stage`: a pipeline stage fails; `no-index`: the active index is gone by the time it runs.
  retrievalFails?: "stage" | "no-index";
  activeIndex?: RagIndex | null;
  published?: CvVersion | null;
  dailyMessageLimit?: number;
  answerReasoning?: ReasoningLevel;
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
  const service = new ChatService({
    conversations,
    pipeline: {
      run: async (request): Promise<RetrievalResult> => {
        retrievals.push(request);
        const trace = traceFor(request, `trace-${retrievals.length}`);
        if (options.retrievalFails === "stage") {
          throw new RetrievalError(trace, new Error("embedding provider down"));
        }
        if (options.retrievalFails === "no-index") throw new NoActiveRagIndexError();
        const scope = options.scope ?? "cv";
        return {
          chunks: scope === "off_topic" ? [] : retrievedChunks,
          scope,
          queries: [request.message],
          trace,
        };
      },
    },
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
    now: () => now,
    // Each reading advances 5 ms.
    clock: () => (tick += 5),
    log: (message) => logged.push(message),
  });
  return { service, conversations, retrievals, saved, logged, chat };
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

function messageText(request: ChatRequest | undefined, index: number): string {
  const content = request?.messages[index]?.content;
  if (typeof content !== "string") throw new Error("expected text content");
  return content;
}

test("a CV question streams meta, deltas, cited sources and done", async () => {
  const { service } = setup();

  const events = await collect(service.reply(ask));

  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    { type: "delta", text: "She built billing at Acme [S1]" },
    { type: "delta", text: " and this site [S2][S9]." },
    {
      type: "sources",
      sources: [
        {
          sourceId: "S1",
          entityKeys: ["experience:acme"],
          title: "Engineer at Acme",
          section: "experience",
          anchor: "#experience-acme",
        },
        {
          sourceId: "S2",
          entityKeys: ["project:portfolio"],
          title: "Portfolio",
          section: "project",
          anchor: "#projects-portfolio",
        },
      ],
    },
    { type: "done" },
  ]);
});

test("retrieval runs with the default config, a chat trace and the trimmed message", async () => {
  const { service, retrievals } = setup();

  await collect(service.reply(ask));

  expect(retrievals).toEqual([
    {
      message: "Where did she work?",
      history: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
      subjectName: "Jane Doe",
      kind: "chat",
    },
  ]);
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

test("reasoning from the answer model is not part of the answer", async () => {
  const { service, conversations } = setup({
    answer: { reasoning: ["Sources say Acme."], deltas: ["She worked at Acme [S1]."] },
  });

  const events = await collect(service.reply(ask));

  expect(events.filter((event) => event.type === "delta")).toEqual([
    { type: "delta", text: "She worked at Acme [S1]." },
  ]);
  expect(conversations.rows[0]?.messages[1]?.text).toBe("She worked at Acme [S1].");
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
      createdAt: now.toISOString(),
    },
    {
      role: "assistant",
      text: "She built billing at Acme [S1] and this site [S2][S9].",
      citedEntityKeys: ["experience:acme", "project:portfolio"],
      traceId: "trace-1",
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
  expect(trace?.stages.map((stage) => stage.name)).toEqual(["rewrite", "generate"]);
  // Clock: retrieval returned at 5, generation ran from 10 to 15; the pipeline's total was 10.
  expect(trace?.stages[1]).toEqual({
    name: "generate",
    input: { model: "answer-model", mode: "cv", sources: 2, historyTurns: 0 },
    output: {
      model: "answer-model",
      usage: { promptTokens: 120, completionTokens: 20, cost: 0.001 },
      answer: "She built billing at Acme [S1] and this site [S2][S9].",
      stopped: false,
      citedSourceIds: ["S1", "S2"],
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
    createdAt: at,
  };
  conversations.rows.push({
    id: "conv-old",
    sessionId: "session-1",
    messages: Array.from({ length: CHAT_SESSION_MESSAGE_LIMIT - 1 }, () => ({ ...userMessage })),
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

  const reply = "I can only answer questions about Jane Doe's experience, skills and background.";
  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    { type: "delta", text: reply },
    { type: "sources", sources: [] },
    { type: "done" },
  ]);
  expect(chat.requests).toHaveLength(0);
  expect(conversations.rows[0]?.messages.map((message) => message.text)).toEqual([
    "Where did she work?",
    reply,
  ]);
  expect(saved.map((trace) => trace.stages.map((stage) => stage.name))).toEqual([["rewrite"]]);
});

test("small talk calls the answer model without sources", async () => {
  const { service, chat, saved } = setup({
    scope: "smalltalk",
    answer: { deltas: ["Hi! Ask me about Jane's work [S1]."] },
  });

  const events = await collect(service.reply({ ...ask, message: "Hello" }));

  expect(events.at(-2)).toEqual({ type: "sources", sources: [] });
  const request = chat.requests[0];
  expect(request?.messages.some((message) => String(message.content).includes("<source"))).toBe(
    false,
  );
  expect(saved[0]?.stages[1]?.input).toEqual({
    model: "answer-model",
    mode: "smalltalk",
    sources: 0,
    historyTurns: 0,
  });
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

test("a retrieval failure saves the partial trace and stores no messages", async () => {
  const { service, conversations, saved, chat, logged } = setup({ retrievalFails: "stage" });

  const events = await collect(service.reply(ask));

  expect(events).toEqual([
    { type: "meta", conversationId: "conv-1" },
    { type: "error", code: "unavailable" },
  ]);
  expect(saved).toHaveLength(1);
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

test("a provider failure ends with an error and records it on the generate stage", async () => {
  const { service, conversations, saved, logged } = setup({
    answer: { deltas: ["Partial", " answer"], failAt: 1 },
  });

  const events = await collect(service.reply(ask));

  expect(events.map((event) => event.type)).toEqual(["meta", "delta", "error"]);
  expect(events.at(-1)).toEqual({ type: "error", code: "unavailable" });
  expect(conversations.rows[0]?.messages).toEqual([]);
  expect(saved[0]?.stages[1]?.error).toBe("provider exploded");
  expect(saved[0]?.stages[1]?.output).toMatchObject({ answer: "Partial", stopped: false });
  expect(logged).toEqual(["Chat answer failed."]);
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

  expect(events.map((event) => event.type)).toEqual(["meta", "delta"]);
  expect(conversations.rows[0]?.messages[1]).toMatchObject({
    role: "assistant",
    text: `She worked at Acme [S1] ${STOPPED_SUFFIX}`,
    citedEntityKeys: ["experience:acme"],
    traceId: "trace-1",
  });
  expect(saved[0]?.stages[1]?.output).toMatchObject({ stopped: true });
  expect(saved[0]?.stages[1]?.error).toBeNull();
});

test("a reader that stops mid-answer still gets the partial answer stored", async () => {
  const { service, conversations, saved } = setup();
  const events = service.reply(ask);

  expect((await events.next()).value).toMatchObject({ type: "meta" });
  expect((await events.next()).value).toMatchObject({ type: "delta" });
  await events.return();

  expect(conversations.rows[0]?.messages[1]?.text).toBe(
    `She built billing at Acme [S1] ${STOPPED_SUFFIX}`,
  );
  expect(saved).toHaveLength(1);
});

test("storage failures are logged and the stream still finishes", async () => {
  const { service, conversations, logged } = setup();
  conversations.appendFails = true;

  const events = await collect(service.reply(ask));

  expect(events.at(-1)).toEqual({ type: "done" });
  expect(logged).toEqual(["Could not store the chat messages."]);
});

test("startOfUtcDay truncates to midnight UTC", () => {
  expect(startOfUtcDay(new Date("2026-09-29T23:59:59.999-05:00"))).toEqual(
    new Date("2026-09-30T00:00:00.000Z"),
  );
});
