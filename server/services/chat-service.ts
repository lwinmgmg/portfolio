import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_SESSION_MESSAGE_LIMIT,
  type ChatEvent,
  type ChatLimitCode,
  type ChatSource,
  type ChatTurn,
  type Conversation,
  type ConversationRepository,
  type StoredMessage,
} from "@/server/domain/chat";
import type { CvVersionRepository } from "@/server/domain/cv";
import type { ChatClient, ChatMessage, ReasoningLevel, Usage } from "@/server/domain/llm";
import {
  RagError,
  RetrievalError,
  type RagIndexRepository,
  type RagTraceRepository,
  type RetrievalResult,
  type RetrievalRunner,
  type RetrievalTrace,
  type RetrievedChunk,
} from "@/server/domain/rag";
import {
  ANSWER_HISTORY_TURNS,
  ANSWER_TEMPERATURE,
  answerGenerationSettings,
  buildAnswerMessages,
  buildSmalltalkMessages,
  offTopicReply,
} from "@/server/rag/answer/answer-prompt";
import { citedEntityKeys, extractCitations } from "@/server/rag/answer/citations";
import { DEFAULT_RETRIEVAL_CONFIG } from "@/server/rag/pipeline/retrieval-config";
import {
  STAGE,
  type GenerateStageInput,
  type GenerateStageOutput,
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
  indexes: Pick<RagIndexRepository, "findActive">;
  cvVersions: Pick<CvVersionRepository, "findPublished">;
  traces: Pick<RagTraceRepository, "save">;
  chat: ChatClient;
  answerModel: string;
  // LLM_ANSWER_REASONING.
  answerReasoning: ReasoningLevel;
  // User messages across all sessions per UTC day.
  dailyMessageLimit: number;
  now?: () => Date;
  // Monotonic milliseconds for the generate stage. Defaults to performance.now().
  clock?: () => number;
  log?: Log;
};

// What one reply works with once retrieval has run.
type Turn = {
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

    const conversation = await this.openConversation(request);
    yield { type: "meta", conversationId: conversation.id };

    const history = conversation.messages.map(({ role, text }): ChatTurn => ({ role, text }));
    const userMessage = this.stored("user", message, [], null);
    let retrieval: RetrievalResult;
    try {
      retrieval = await this.deps.pipeline.run({
        message,
        history,
        config: DEFAULT_RETRIEVAL_CONFIG,
        subjectName,
        kind: "chat",
      });
    } catch (error) {
      if (error instanceof RetrievalError) {
        this.log("Chat retrieval failed.", error.cause);
        await this.saveTrace(error.trace);
      } else if (!(error instanceof RagError)) {
        throw error;
      }
      yield { type: "error", code: "unavailable" };
      return;
    }

    const turn: Turn = {
      conversation,
      userMessage,
      history,
      subjectName,
      retrieval,
      retrievedAt: this.clock(),
      signal: request.signal,
    };
    if (retrieval.scope === "off_topic") {
      yield* this.fixedReply(turn, offTopicReply(subjectName));
    } else {
      yield* this.generate(turn);
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

  // Off-topic messages get a fixed answer without an LLM call.
  private async *fixedReply(turn: Turn, text: string): AsyncGenerator<ChatEvent, void, undefined> {
    yield { type: "delta", text };
    await this.appendTurn(turn, text, []);
    await this.saveTrace(turn.retrieval.trace);
    yield { type: "sources", sources: [] };
    yield { type: "done" };
  }

  private async *generate(turn: Turn): AsyncGenerator<ChatEvent, void, undefined> {
    const smalltalk = turn.retrieval.scope === "smalltalk";
    const chunks: RetrievedChunk[] = smalltalk ? [] : turn.retrieval.chunks;
    const prompt = { subjectName: turn.subjectName, history: turn.history, message: turn.userMessage.text };
    const messages: ChatMessage[] = smalltalk
      ? buildSmalltalkMessages(prompt)
      : buildAnswerMessages({ ...prompt, chunks });
    const input: GenerateStageInput = {
      model: this.deps.answerModel,
      mode: smalltalk ? "smalltalk" : "cv",
      sources: chunks.length,
      historyTurns: Math.min(turn.history.length, ANSWER_HISTORY_TURNS),
    };

    const started = this.clock();
    let text = "";
    let usage: Usage | null = null;
    let outcome: Outcome = "streaming";
    let error: string | null = null;
    let sources: ChatSource[] = [];
    try {
      try {
        const stream = this.deps.chat.stream({
          model: this.deps.answerModel,
          messages,
          ...answerGenerationSettings(this.deps.answerReasoning),
          temperature: ANSWER_TEMPERATURE,
          signal: turn.signal,
        });
        for await (const event of stream) {
          if (event.type === "done") {
            usage = event.usage;
            continue;
          }
          // Phase 3.3 streams reasoning to the visitor; until then it is not part of the answer.
          if (event.type === "reasoning") continue;
          text += event.text;
          yield { type: "delta", text: event.text };
        }
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
      };
      const trace = withGenerateStage(turn, input, output, error, started, this.clock());
      // A failed answer is not stored, so it does not count toward the limits.
      if (outcome !== "failed") {
        await this.appendTurn(turn, stopped ? stoppedText(text) : text, sources, trace.id);
      }
      await this.saveTrace(trace);
    }

    if (outcome === "failed") {
      yield { type: "error", code: "unavailable" };
      return;
    }
    if (outcome === "stopped") return;
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

function stoppedText(text: string): string {
  const partial = text.trimEnd();
  return partial ? `${partial} ${STOPPED_SUFFIX}` : STOPPED_SUFFIX;
}

// The pipeline's trace ends when retrieval returns; generation is placed after it on the same timeline.
function withGenerateStage(
  turn: Turn,
  input: GenerateStageInput,
  output: GenerateStageOutput,
  error: string | null,
  started: number,
  ended: number,
): RetrievalTrace {
  const { trace } = turn.retrieval;
  const startedAt = trace.totalMs + (started - turn.retrievedAt);
  const durationMs = ended - started;
  return {
    ...trace,
    stages: [
      ...trace.stages,
      { name: STAGE.generate, input, output, startedAt, durationMs, error },
    ],
    totalMs: startedAt + durationMs,
  };
}
