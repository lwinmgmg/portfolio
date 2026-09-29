import type {
  ChatStep,
  ChatStepDetail,
  ChatStepHit,
  ChatStepName,
  ChatStepStatus,
  ToolCallOutcome,
} from "@/server/domain/chat";
import type { QueryScope } from "@/server/domain/rag";

// Hand-written guards for the step events, so the client bundle needs no zod.

export const CHAT_STEP_STATUSES: readonly ChatStepStatus[] = ["running", "done", "failed"];

type DetailKind = ChatStepDetail["kind"];

// The detail kind each step reports. A detail of another kind is read as malformed.
const DETAIL_KIND: Record<ChatStepName, DetailKind> = {
  route: "route",
  rewrite: "rewrite",
  "embed-queries": "embed",
  "vector-search": "search",
  "lexical-search": "search",
  fuse: "fuse",
  rerank: "rerank",
  filter: "filter",
  reasoning: "reasoning",
  generate: "generate",
  tool: "tool",
};

const SCOPES: readonly QueryScope[] = ["cv", "smalltalk", "off_topic", "contact"];

const TOOL_OUTCOMES: readonly ToolCallOutcome[] = [
  "drafted",
  "invalid",
  "unknown_tool",
  "ignored",
  "failed",
];

// Checks the fields of one detail kind; the kind itself is already known.
const DETAIL_GUARDS: Record<DetailKind, (value: Record<string, unknown>) => boolean> = {
  route: (value) =>
    (value.scope === null || SCOPES.some((scope) => scope === value.scope)) &&
    typeof value.fallback === "boolean",
  rewrite: (value) =>
    isArrayOf(value.queries, isString) &&
    SCOPES.some((scope) => scope === value.scope) &&
    typeof value.fallback === "boolean",
  embed: (value) => isNumber(value.count) && isNumber(value.dimensions),
  search: (value) =>
    (value.method === "vector" || value.method === "bm25") &&
    isArrayOf(
      value.lists,
      (list) =>
        isRecord(list) &&
        isString(list.query) &&
        isNumber(list.total) &&
        isArrayOf(list.hits, isChatStepHit),
    ),
  fuse: (value) =>
    isNumber(value.total) &&
    isArrayOf(
      value.hits,
      (hit) =>
        isChatStepHit(hit) &&
        isArrayOf(
          hit.contributions,
          (item) => isRecord(item) && isString(item.list) && isNumber(item.rank),
        ),
    ),
  rerank: (value) =>
    typeof value.fallback === "boolean" &&
    isArrayOf(value.hits, (hit) => isChatStepHit(hit) && isNumber(hit.fusedRank)),
  filter: (value) =>
    isNumber(value.minScore) && isNumber(value.kept) && isArrayOf(value.dropped, isChatStepHit),
  reasoning: () => true,
  generate: (value) => isNumber(value.sources),
  tool: (value) =>
    isString(value.name) && TOOL_OUTCOMES.some((outcome) => outcome === value.outcome),
};

// A step with one of `statuses`, or null when its name, kind or status is unknown or its
// fields are missing. A detail of a known kind that is malformed becomes null instead.
export function readChatStep<S extends string>(
  value: unknown,
  statuses: readonly S[],
): (Omit<ChatStep, "status"> & { status: S }) | null {
  if (!isRecord(value) || !isChatStepName(value.name)) return null;
  const status = statuses.find((known) => known === value.status);
  if (status === undefined || !isNumber(value.startedAt)) return null;
  if (value.durationMs !== null && !isNumber(value.durationMs)) return null;
  const detail = value.detail;
  // A kind added by a newer server: this client cannot show the step at all.
  if (isRecord(detail) && isString(detail.kind) && !isDetailKind(detail.kind)) return null;
  return {
    name: value.name,
    status,
    startedAt: value.startedAt,
    durationMs: value.durationMs,
    detail: isRecord(detail) && isDetailFor(value.name, detail) ? detail : null,
  };
}

export function parseChatStep(value: unknown): ChatStep | null {
  return readChatStep(value, CHAT_STEP_STATUSES);
}

function isChatStepName(value: unknown): value is ChatStepName {
  return typeof value === "string" && Object.hasOwn(DETAIL_KIND, value);
}

function isDetailKind(value: string): value is DetailKind {
  return Object.hasOwn(DETAIL_GUARDS, value);
}

function isDetailFor(
  name: ChatStepName,
  detail: Record<string, unknown>,
): detail is ChatStepDetail {
  const kind = DETAIL_KIND[name];
  return detail.kind === kind && DETAIL_GUARDS[kind](detail);
}

function isChatStepHit(value: unknown): value is ChatStepHit & Record<string, unknown> {
  return (
    isRecord(value) &&
    isNumber(value.rank) &&
    isNumber(value.score) &&
    isString(value.title) &&
    isString(value.section) &&
    (value.anchor === null || isCvAnchor(value.anchor))
  );
}

// Anchors become hrefs, so only same-page fragments are accepted.
export function isCvAnchor(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("#");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isArrayOf(value: unknown, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(guard);
}
