import type { ChatTurn } from "@/server/domain/chat";
import type { RetrievalConfig } from "@/server/domain/rag";
import {
  RetrievalConfigSchema,
  retrievalConfigErrorMessage,
} from "@/server/rag/pipeline/retrieval-config";
import type { PlaygroundRequest } from "@/server/services/retrieval-playground-service";

// Same limit as a chat message.
export const PLAYGROUND_MESSAGE_MAX_CHARS = 500;

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const ROLE_LINE = /^(user|assistant)\s*:\s*(.*)$/i;

// One turn per line, `user: ...` or `assistant: ...`, oldest first. Blank lines are skipped.
export function parseHistory(text: string): Parsed<ChatTurn[]> {
  const turns: ChatTurn[] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    const match = ROLE_LINE.exec(line.trim());
    const role = match?.[1]?.toLowerCase();
    const turnText = match?.[2]?.trim() ?? "";
    if ((role !== "user" && role !== "assistant") || turnText === "") {
      return {
        ok: false,
        message: `History line ${index + 1} must look like "user: ..." or "assistant: ...".`,
      };
    }
    turns.push({ role, text: turnText });
  }
  return { ok: true, value: turns };
}

export function parseRetrievalConfig(form: FormData): Parsed<RetrievalConfig> {
  const parsed = RetrievalConfigSchema.safeParse({
    rewrite: form.get("rewrite"),
    search: form.get("search"),
    candidatesPerSearch: numberField(form, "candidatesPerSearch"),
    rrfK: numberField(form, "rrfK"),
    fusedLimit: numberField(form, "fusedLimit"),
    rerank: form.get("rerank") === "on",
    finalK: numberField(form, "finalK"),
    minRerankScore: numberField(form, "minRerankScore"),
    ignoreSubjectInLexical: form.get("ignoreSubjectInLexical") === "on",
    ignoreSubjectInRerank: form.get("ignoreSubjectInRerank") === "on",
    dropBelowMeanRerank: form.get("dropBelowMeanRerank") === "on",
    meanCutoffFactor: numberField(form, "meanCutoffFactor"),
    scopeRouter: form.get("scopeRouter"),
    minRouteConfidence: numberField(form, "minRouteConfidence"),
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, message: retrievalConfigErrorMessage(parsed.error) };
}

export function parsePlaygroundForm(form: FormData): Parsed<PlaygroundRequest> {
  const rawMessage = form.get("message");
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (message.length === 0) return { ok: false, message: "Enter a question." };
  if (message.length > PLAYGROUND_MESSAGE_MAX_CHARS) {
    return {
      ok: false,
      message: `Keep the question under ${PLAYGROUND_MESSAGE_MAX_CHARS} characters.`,
    };
  }

  const rawHistory = form.get("history");
  const history = parseHistory(typeof rawHistory === "string" ? rawHistory : "");
  if (!history.ok) return history;

  const config = parseRetrievalConfig(form);
  if (!config.ok) return config;

  const rawIndexId = form.get("indexId");
  const indexId = typeof rawIndexId === "string" && rawIndexId.trim() !== "" ? rawIndexId.trim() : null;

  return { ok: true, value: { message, history: history.value, config: config.value, indexId } };
}

// A missing or non-numeric field becomes NaN, which the schema rejects.
function numberField(form: FormData, name: string): number {
  const value = form.get(name);
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  return Number(value);
}
