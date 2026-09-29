import "server-only";

import { cache } from "react";
import { connection } from "next/server";

import { EmailDraftTool } from "@/server/agent/email-draft-tool";
import type { AgentTool } from "@/server/domain/agent";
import type { ChatEvent } from "@/server/domain/chat";
import { getLlm } from "@/server/llm/llm-runtime";
import { getRag, isRagConfigured } from "@/server/rag/rag-runtime";
import { MongoConversationRepository } from "@/server/repositories/conversation-repository";
import { MongoCvVersionRepository } from "@/server/repositories/cv-version-repository";
import { MongoRagIndexRepository } from "@/server/repositories/rag-index-repository";
import { MongoRagTraceRepository } from "@/server/repositories/rag-trace-repository";
import { ChatService, type ChatReplyRequest } from "@/server/services/chat-service";
import {
  ContactEmailService,
  type ContactDraftRequest,
  type DiscardResult,
  type SendResult,
} from "@/server/services/contact-email-service";
import { getEmail } from "@/server/services/email-runtime";

const conversations = new MongoConversationRepository();
const indexes = new MongoRagIndexRepository();
const traces = new MongoRagTraceRepository();
const cvVersions = new MongoCvVersionRepository();

let chat: ChatService | null = null;

// Built on first use, like the RAG runtime, because getLlm() throws without OpenRouter settings.
function getChat(): ChatService {
  if (chat) return chat;
  const { client, env } = getLlm();
  const rag = getRag();
  chat = new ChatService({
    conversations,
    pipeline: rag.pipeline,
    retrievalConfig: async () => (await rag.settings.chatSettings()).config,
    indexes,
    cvVersions,
    traces,
    chat: client,
    answerModel: env.LLM_ANSWER_MODEL,
    answerReasoning: env.LLM_ANSWER_REASONING,
    dailyMessageLimit: env.CHAT_DAILY_MESSAGE_LIMIT,
    tools: agentTools,
  });
  return chat;
}

const emailDraftTool = new EmailDraftTool(conversations);

const contactEmail = new ContactEmailService({
  drafts: conversations,
  outbox: () => getEmail().outbox(),
});

// The email tool only drafts, but it is offered only when a draft could later be sent: the email
// env is set and the owner has connected Gmail.
async function agentTools(): Promise<AgentTool[]> {
  return (await getEmail().isReady()) ? [emailDraftTool] : [];
}

export function isChatConfigured(): boolean {
  return isRagConfigured();
}

// Whether the public page shows the chat: configured, with an active index to answer from.
// A failed lookup hides the chat instead of breaking the CV page.
export const isChatAvailable = cache(async (): Promise<boolean> => {
  await connection();
  if (!isChatConfigured()) return false;
  try {
    return (await indexes.findActive()) !== null;
  } catch (error) {
    console.error("Could not check the active RAG index.", error);
    return false;
  }
});

export function replyToChat(request: ChatReplyRequest): AsyncIterable<ChatEvent> {
  return getChat().reply(request);
}

// The visitor's Send click on a draft. The model never reaches this.
export function sendContactEmail(request: ContactDraftRequest): Promise<SendResult> {
  return contactEmail.send(request);
}

export function discardContactEmail(request: ContactDraftRequest): Promise<DiscardResult> {
  return contactEmail.discard(request);
}
