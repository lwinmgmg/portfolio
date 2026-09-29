import { runAnswerLoop } from "@/server/agent/answer-loop";
import { SEND_EMAIL_TOOL } from "@/server/agent/email-draft-tool";
import type { AgentTool } from "@/server/domain/agent";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_REASONING_MAX_CHARS,
  CHAT_SESSION_MESSAGE_LIMIT,
  EMAIL_DRAFT_TTL_MS,
  type ChatEvent,
  type ChatLimitCode,
  type ChatSource,
  type ChatStep,
  type ChatStepName,
  type ChatTurn,
  type Conversation,
  type ConversationRepository,
  type StoredMessage,
} from "@/server/domain/chat";
import type { CvVersionRepository } from "@/server/domain/cv";
import type { ChatClient, ChatMessage, ReasoningLevel, ToolCall, Usage } from "@/server/domain/llm";
import {
  RagError,
  RetrievalError,
  type RagIndexRepository,
  type RagTraceRepository,
  type RetrievalConfig,
  type RetrievalResult,
  type RetrievalRunner,
  type RetrievalTrace,
  type RetrievedChunk,
  type TraceObserver,
  type TraceStage,
} from "@/server/domain/rag";
import {
  ANSWER_HISTORY_TURNS,
  ANSWER_TEMPERATURE,
  answerGenerationSettings,
  buildAnswerMessages,
  buildContactMessages,
  contactUnavailableReply,
  noInformationReply,
  offTopicReply,
  smalltalkReply,
} from "@/server/rag/answer/answer-prompt";
import { citedEntityKeys, extractCitations } from "@/server/rag/answer/citations";
import { finishedStep, isChatStepName, runningStep } from "@/server/rag/progress/chat-steps";
import { EventChannel } from "@/server/rag/progress/event-channel";
import {
  STAGE,
  type GenerateStageInput,
  type GenerateStageOutput,
  type ToolStageInput,
  type ToolStageOutput,
} from "@/server/rag/pipeline/trace-stages";

// Appended to a stored answer the visitor stopped before it finished.
export const STOPPED_SUFFIX = "[stopped]";

export type ChatReplyRequest = {
  // The public session sending the message. It owns the conversation.
  sessionId: string;
  // Null, or an id from another session, starts a new conversation.
  conversationId: string | null;
  message: string;
  // Aborted when the visitor stops the answer or disconnects.
  signal?: AbortSignal;
};

type Log = (message: string, error: unknown) => void;

export type ChatServiceDeps = {
  conversations: ConversationRepository;
  pipeline: RetrievalRunner;
  // The saved chat config, read once per turn, so a change applies from the next turn.
  retrievalConfig: () => Promise<RetrievalConfig>;
  indexes: Pick<RagIndexRepository, "findActive">;
  cvVersions: Pick<CvVersionRepository, "findPublished">;
  traces: Pick<RagTraceRepository, "save">;
  chat: ChatClient;
  answerModel: string;
  // LLM_ANSWER_REASONING.
  answerReasoning: ReasoningLevel;
  // User messages across all sessions per UTC day.
  dailyMessageLimit: number;
  // Offered to the answer model for `cv` and `contact` turns, looked up per turn because the owner
  // can connect or disconnect Gmail at any time. None (the default, or a failed lookup): one plain
  // answer call, and a contact request gets a fixed reply.
  tools?: () => Promise<readonly AgentTool[]>;
  now?: () => Date;
  // Monotonic milliseconds for the generate stage. Defaults to performance.now().
  clock?: () => number;
  log?: Log;
};

// What one reply works with once retrieval has run.
type Turn = {
  sessionId: string;
  conversation: Conversation;
  userMessage: StoredMessage;
  history: ChatTurn[];
  subjectName: string;
  retrieval: RetrievalResult;
  // Clock reading when retrieval returned; the trace's `totalMs` was measured then.
  retrievedAt: number;
  signal: AbortSignal | undefined;
};

type Outcome = "streaming" | "complete" | "stopped" | "failed";

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// One visitor message: limits, retrieval, a streamed answer, then the stored turn and trace.
export class ChatService {
  private readonly now: () => Date;
  private readonly clock: () => number;
  private readonly log: Log;

  constructor(private readonly deps: ChatServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.clock = deps.clock ?? (() => performance.now());
    this.log = deps.log ?? ((message, error) => console.error(message, error));
  }

  async *reply(request: ChatReplyRequest): AsyncGenerator<ChatEvent, void, undefined> {
    const message = request.message.trim();
    if (message.length === 0 || message.length > CHAT_MESSAGE_MAX_CHARS) {
      yield { type: "error", code: "invalid_message" };
      return;
    }

    const limit = await this.limitFor(request.sessionId);
    if (limit) {
      yield { type: "limit", code: limit };
      return;
    }

    // Checked before a conversation is created, so an unavailable chat leaves nothing behind.
    const subjectName = await this.subjectName();
    if (subjectName === null || (await this.deps.indexes.findActive()) === null) {
      yield { type: "error", code: "unavailable" };
      return;
    }
    const config = await this.deps.retrievalConfig();

    const conversation = await this.openConversation(request);
    yield { type: "meta", conversationId: conversation.id };

    const history = conversation.messages.map(({ role, text }): ChatTurn => ({ role, text }));
    const userMessage = this.stored("user", message, [], null);
    const progress = new EventChannel<ChatStep>();
    const run = this.deps.pipeline.run({
      message,
      history,
      config,
      subjectName,
      kind: "chat",
      observer: stepObserver(progress),
    });
    // The steps end when the pipeline settles, either way; `settleRetrieval` reads the outcome.
    void run.then(
      () => progress.close(),
      () => progress.close(),
    );

    let watching = true;
    try {
      for await (const step of progress) yield { type: "step", step };
      watching = false;
    } finally {
      // The visitor left during retrieval: nothing is stored, but the trace is saved once it ends.
      if (watching) {
        const stopped = await this.settleRetrieval(run);
        if (stopped) await this.saveTrace(stopped.trace);
      }
    }

    const retrieval = await this.settleRetrieval(run);
    if (retrieval === null) {
      yield { type: "error", code: "unavailable" };
      return;
    }
    // Stopped while retrieval ran, but between steps: the same as leaving during retrieval.
    if (request.signal?.aborted) {
      await this.saveTrace(retrieval.trace);
      return;
    }

    const turn: Turn = {
      sessionId: request.sessionId,
      conversation,
      userMessage,
      history,
      subjectName,
      retrieval,
      retrievedAt: this.clock(),
      signal: request.signal,
    };
    switch (retrieval.scope) {
      case "off_topic":
        yield* this.fixedReply(turn, offTopicReply(subjectName));
        return;
      // Small talk keeps its fixed reply (2.14a), so it never reaches a model that has tools.
      case "smalltalk":
        yield* this.fixedReply(turn, smalltalkReply(subjectName));
        return;
      case "contact": {
        const tools = await this.offeredTools();
        if (tools.length === 0) {
          yield* this.fixedReply(turn, contactUnavailableReply(subjectName));
        } else {
          yield* this.generate(turn, "contact", tools);
        }
        return;
      }
      case "cv":
        if (retrieval.chunks.length === 0) {
          // Nothing passed retrieval, e.g. every chunk scored below `minRerankScore`.
          yield* this.fixedReply(turn, noInformationReply(subjectName));
        } else {
          yield* this.generate(turn, "cv", await this.offeredTools());
        }
        return;
    }
  }

  // A failed lookup answers without tools rather than failing the turn.
  private async offeredTools(): Promise<readonly AgentTool[]> {
    if (!this.deps.tools) return [];
    try {
      return await this.deps.tools();
    } catch (error) {
      this.log("Chat tools lookup failed.", error);
      return [];
    }
  }

  // Null when retrieval failed. A failed stage's partial trace is saved here.
  private async settleRetrieval(run: Promise<RetrievalResult>): Promise<RetrievalResult | null> {
    try {
      return await run;
    } catch (error) {
      if (error instanceof RetrievalError) {
        this.log("Chat retrieval failed.", error.cause);
        await this.saveTrace(error.trace);
        return null;
      }
      if (error instanceof RagError) return null;
      throw error;
    }
  }

  private async limitFor(sessionId: string): Promise<ChatLimitCode | null> {
    const { conversations, dailyMessageLimit } = this.deps;
    if ((await conversations.countUserMessagesForSession(sessionId)) >= CHAT_SESSION_MESSAGE_LIMIT) {
      return "session_limit";
    }
    const today = startOfUtcDay(this.now());
    if ((await conversations.countUserMessagesSince(today)) >= dailyMessageLimit) {
      return "daily_limit";
    }
    return null;
  }

  private async subjectName(): Promise<string | null> {
    const published = await this.deps.cvVersions.findPublished();
    const name = published?.data?.profile.fullName.trim();
    return name ? name : null;
  }

  private async openConversation(request: ChatReplyRequest): Promise<Conversation> {
    const { conversations } = this.deps;
    const existing = request.conversationId
      ? await conversations.findForSession(request.conversationId, request.sessionId)
      : null;
    return existing ?? conversations.create(request.sessionId);
  }

  // Small talk, off-topic messages and CV questions with no sources get a fixed answer without an
  // LLM call.
  private async *fixedReply(turn: Turn, text: string): AsyncGenerator<ChatEvent, void, undefined> {
    yield { type: "delta", text };
    await this.appendTurn(turn, text, []);
    await this.saveTrace(turn.retrieval.trace);
    yield { type: "sources", sources: [] };
    yield { type: "done" };
  }

  private async *generate(
    turn: Turn,
    mode: "cv" | "contact",
    // A contact turn is only generated when tools are offered.
    tools: readonly AgentTool[],
  ): AsyncGenerator<ChatEvent, void, undefined> {
    const chunks: RetrievedChunk[] = turn.retrieval.chunks;
    const pendingDraft = tools.length > 0 ? pendingDraftText(turn.conversation, this.now()) : null;
    const messages: ChatMessage[] =
      mode === "cv"
        ? buildAnswerMessages({
            subjectName: turn.subjectName,
            history: turn.history,
            message: turn.userMessage.text,
            chunks,
            emailTool: tools.some((tool) => tool.definition.name === SEND_EMAIL_TOOL),
            pendingDraft,
          })
        : buildContactMessages({
            subjectName: turn.subjectName,
            history: turn.history,
            message: turn.userMessage.text,
            pendingDraft,
          });
    const input: GenerateStageInput = {
      model: this.deps.answerModel,
      mode,
      sources: chunks.length,
      historyTurns: Math.min(turn.history.length, ANSWER_HISTORY_TURNS),
      tools: tools.map((tool) => tool.definition.name),
      pendingDraft: pendingDraft !== null,
    };

    const started = this.clock();
    const steps = new AnswerSteps(input, started, (t) => onTraceTimeline(turn, t));
    const toolStages: TraceStage[] = [];
    let toolStarted = started;
    let text = "";
    let reasoning = "";
    let usage: Usage | null = null;
    let rounds: number | undefined;
    let outcome: Outcome = "streaming";
    let error: string | null = null;
    let sources: ChatSource[] = [];
    let ended = started;
    try {
      try {
        const loop = runAnswerLoop({
          chat: this.deps.chat,
          request: {
            model: this.deps.answerModel,
            messages,
            ...answerGenerationSettings(this.deps.answerReasoning),
            temperature: ANSWER_TEMPERATURE,
            signal: turn.signal,
          },
          tools,
          context: {
            conversationId: turn.conversation.id,
            sessionId: turn.sessionId,
            now: this.now(),
          },
        });
        for await (const event of loop) {
          switch (event.type) {
            case "done":
              usage = event.usage;
              rounds = event.rounds;
              break;
            // Reasoning is shown to the visitor but is not part of the answer.
            case "reasoning":
              yield* steps.reasoningText();
              reasoning += event.text;
              yield { type: "reasoning", text: event.text };
              break;
            case "delta":
              yield* steps.answerText(() => this.clock());
              text += event.text;
              yield { type: "delta", text: event.text };
              break;
            case "tool_started":
              toolStarted = this.clock();
              yield* steps.toolStarted(toolStarted);
              break;
            case "tool_ended": {
              const toolEnded = this.clock();
              const stage = toolStage(turn, event.call, event, toolStarted, toolEnded);
              toolStages.push(stage);
              if (event.error !== null) this.log("Chat tool failed.", event.error);
              yield* steps.toolEnded(stage, toolEnded);
              if (event.event) yield event.event;
              break;
            }
            // Only in the trace: the visitor sees the call that ran.
            case "tool_ignored": {
              const now = this.clock();
              toolStages.push(toolStage(turn, event.call, ignoredTool, now, now));
              break;
            }
          }
        }
        // An answer with no text still has a generate step to finish.
        yield* steps.answerText(() => this.clock());
        outcome = "complete";
      } catch (failure) {
        if (turn.signal?.aborted) {
          outcome = "stopped";
        } else {
          outcome = "failed";
          error = failure instanceof Error ? failure.message : String(failure);
          this.log("Chat answer failed.", failure);
        }
      }
    } finally {
      // Still streaming here means the reader stopped pulling: the visitor went away mid-answer.
      if (outcome === "streaming") outcome = "stopped";
      sources = extractCitations(text, chunks);
      const stopped = outcome === "stopped";
      const output: GenerateStageOutput = {
        model: this.deps.answerModel,
        usage,
        answer: text,
        stopped,
        citedSourceIds: sources.map((source) => source.sourceId),
        reasoning: reasoning ? reasoning.slice(0, CHAT_REASONING_MAX_CHARS) : null,
        ...(rounds === undefined ? {} : { rounds }),
      };
      ended = this.clock();
      const trace = withGenerateStage(turn, input, output, error, started, ended, toolStages);
      // A failed answer is not stored, so it does not count toward the limits.
      if (outcome !== "failed") {
        await this.appendTurn(turn, stopped ? stoppedText(text) : text, sources, trace.id);
      }
      await this.saveTrace(trace);
    }

    if (outcome === "failed") {
      yield* steps.end(ended, error ?? "failed");
      yield { type: "error", code: "unavailable" };
      return;
    }
    if (outcome === "stopped") return;
    yield* steps.end(ended, null);
    yield { type: "sources", sources };
    yield { type: "done" };
  }

  // Persistence failures are logged; the visitor already has the answer.
  private async appendTurn(
    turn: Turn,
    text: string,
    sources: readonly ChatSource[],
    traceId: string = turn.retrieval.trace.id,
  ): Promise<void> {
    try {
      await this.deps.conversations.append(turn.conversation.id, [
        turn.userMessage,
        this.stored("assistant", text, citedEntityKeys(sources), traceId),
      ]);
    } catch (error) {
      this.log("Could not store the chat messages.", error);
    }
  }

  private async saveTrace(trace: RetrievalTrace): Promise<void> {
    try {
      await this.deps.traces.save(trace);
    } catch (error) {
      this.log("Could not save the chat trace.", error);
    }
  }

  private stored(
    role: StoredMessage["role"],
    text: string,
    entityKeys: string[],
    traceId: string | null,
  ): StoredMessage {
    return { role, text, citedEntityKeys: entityKeys, traceId, createdAt: this.now().toISOString() };
  }
}

// The newest draft, when it is still pending and young enough to send (Plan 4 draft lifetime).
function pendingDraftText(conversation: Conversation, now: Date): string | null {
  const newest = conversation.emailDrafts.at(-1);
  if (!newest || newest.status !== "pending") return null;
  return now.getTime() - Date.parse(newest.createdAt) < EMAIL_DRAFT_TTL_MS ? newest.text : null;
}

const ignoredTool: Pick<ToolStageOutput, "outcome" | "draftId"> & { error: null } = {
  outcome: "ignored",
  draftId: null,
  error: null,
};

// A `tool` trace stage. A tool that threw keeps its error there; the visitor's step only fails.
function toolStage(
  turn: Turn,
  call: ToolCall,
  result: Pick<ToolStageOutput, "outcome" | "draftId"> & { error: string | null },
  started: number,
  ended: number,
): TraceStage {
  const input: ToolStageInput = { name: call.name, arguments: call.arguments };
  const output: ToolStageOutput = { outcome: result.outcome, draftId: result.draftId };
  return {
    name: STAGE.tool,
    input,
    output,
    startedAt: onTraceTimeline(turn, started),
    durationMs: ended - started,
    error: result.error,
  };
}

function stoppedText(text: string): string {
  const partial = text.trimEnd();
  return partial ? `${partial} ${STOPPED_SUFFIX}` : STOPPED_SUFFIX;
}

// Pushes a step when each retrieval stage starts and ends.
function stepObserver(progress: EventChannel<ChatStep>): TraceObserver {
  return {
    stageStarted: (name, startedAt) => {
      if (isChatStepName(name)) progress.push(runningStep(name, startedAt));
    },
    stageEnded: (stage) => {
      const step = finishedStep(stage);
      if (step) progress.push(step);
    },
  };
}

// The pipeline's trace ends when retrieval returns; generation is placed after it on the same
// timeline, so a clock reading `t` is at `totalMs + (t - retrievedAt)`.
function onTraceTimeline(turn: Turn, t: number): number {
  return turn.retrieval.trace.totalMs + (t - turn.retrievedAt);
}

function stepEvents(step: ChatStep | null): ChatEvent[] {
  return step ? [{ type: "step", step }] : [];
}

type AnswerStepName = Extract<ChatStepName, "reasoning" | "generate">;

// The visitor's steps for the answer: `reasoning` while the model thinks, then `generate` from
// the first answer text. A tool call adds a `tool` step between them. Each method returns the
// step events to send; times are clock readings.
//
// The client lists one step per name, so each name is sent once: round 2's reasoning streams
// without a second `reasoning` step, and `generate` stays running across a tool call when
// round 1 already wrote text.
class AnswerSteps {
  private current: { name: AnswerStepName; startedAt: number } | null = null;
  private reasoned = false;
  // When the next step starts: the ask, then the end of the tool call.
  private resumeAt: number;

  constructor(
    private readonly input: GenerateStageInput,
    // When the model was asked. Its reasoning, or else its answer, is timed from here.
    private readonly started: number,
    private readonly onTimeline: (t: number) => number,
  ) {
    this.resumeAt = started;
  }

  // Before each reasoning text. Only the first, before any answer text, starts the step.
  reasoningText(): ChatEvent[] {
    if (this.current || this.reasoned) return [];
    this.reasoned = true;
    return this.start("reasoning", this.resumeAt);
  }

  // Before each answer text. The first ends `reasoning`, if it runs, and starts `generate`.
  answerText(clock: () => number): ChatEvent[] {
    if (this.current?.name === "generate") return [];
    if (this.current === null) return this.start("generate", this.resumeAt);
    const now = clock();
    return [...this.finish(now, null), ...this.start("generate", now)];
  }

  // Round 1's reasoning ends where the tool starts; a running `generate` goes on.
  toolStarted(t: number): ChatEvent[] {
    const events = this.current?.name === "reasoning" ? this.finish(t, null) : [];
    return [...events, ...stepEvents(runningStep("tool", this.onTimeline(t)))];
  }

  // `stage` is the tool's trace stage, projected like the others.
  toolEnded(stage: TraceStage, t: number): ChatEvent[] {
    this.resumeAt = t;
    return stepEvents(finishedStep(stage));
  }

  // Finishes the running step, or fails it with `error`. A failure before any step started is
  // the generate step's.
  end(ended: number, error: string | null): ChatEvent[] {
    this.current ??= { name: "generate", startedAt: this.resumeAt };
    return this.finish(ended, error);
  }

  private start(name: AnswerStepName, startedAt: number): ChatEvent[] {
    this.current = { name, startedAt };
    return stepEvents(runningStep(name, this.onTimeline(startedAt)));
  }

  // Projected like the retrieval stages, so the detail comes from the same readers.
  private finish(ended: number, error: string | null): ChatEvent[] {
    const { current } = this;
    if (current === null) return [];
    this.current = null;
    return stepEvents(
      finishedStep({
        name: current.name,
        input: this.input,
        output: null,
        startedAt: this.onTimeline(current.startedAt),
        durationMs: ended - current.startedAt,
        error,
      }),
    );
  }
}

function withGenerateStage(
  turn: Turn,
  input: GenerateStageInput,
  output: GenerateStageOutput,
  error: string | null,
  started: number,
  ended: number,
  // Tool calls made during generation, in start order, so after the generate stage.
  toolStages: readonly TraceStage[],
): RetrievalTrace {
  const { trace } = turn.retrieval;
  const startedAt = onTraceTimeline(turn, started);
  const durationMs = ended - started;
  return {
    ...trace,
    stages: [
      ...trace.stages,
      { name: STAGE.generate, input, output, startedAt, durationMs, error },
      ...toolStages,
    ],
    totalMs: startedAt + durationMs,
  };
}
