import type { AssistantEntry, ChatState } from "@/app/(public)/_components/chat/chat-state";
import type { QueryScope } from "@/server/domain/rag";

// The owner may rename the robot; every visible mention reads this.
export const ROBOT_NAME = "Bit";

export type RobotMood =
  | "idle"
  | "waving"
  | "listening"
  | "thinking"
  | "talking"
  | "puzzled"
  | "happy"
  | "sad";

export const ROBOT_MOODS: readonly RobotMood[] = [
  "idle",
  "waving",
  "listening",
  "thinking",
  "talking",
  "puzzled",
  "happy",
  "sad",
];

export type RobotMoodInput = {
  chat: ChatState;
  // The composer has text. Always false while the panel is closed.
  typing: boolean;
  // The greeting bubble is open.
  greeting: boolean;
};

// The robot keeps no chat state of its own: its mood is read from the chat each render.
// Rows are checked in the order of the Phase 5 moods table; the first match wins.
export function robotMood({ chat, typing, greeting }: RobotMoodInput): RobotMood {
  if (greeting) return "waving";
  const answer = lastAnswer(chat);
  if (chat.streaming) {
    // A turn that has not produced its pending entry yet is still thinking.
    return answer?.status === "streaming" && answer.text ? "talking" : "thinking";
  }
  if (typing) return "listening";
  if (chat.notice !== null) return "sad";
  if (!answer) return "idle";
  const draft = answer.emailDraft?.state;
  if (answer.status === "interrupted" || draft === "failed" || draft === "limit") return "sad";
  if (draft === "sent") return "happy";
  if (lastScope(answer) === "off_topic") return "puzzled";
  return "idle";
}

// The route step's scope when it short-circuited, else the rewriter's. Null when neither step
// ran or reported one, as for an entry stored before steps existed.
export function lastScope(entry: AssistantEntry): QueryScope | null {
  let rewriteScope: QueryScope | null = null;
  for (const step of entry.steps) {
    if (step.detail?.kind === "route" && step.detail.scope !== null) return step.detail.scope;
    if (step.detail?.kind === "rewrite") rewriteScope = step.detail.scope;
  }
  return rewriteScope;
}

// Only the final entry counts: when a failed turn drops its empty answer, the visitor's message
// is last, and an older answer's sent email or odd question no longer describes the chat.
function lastAnswer(chat: ChatState): AssistantEntry | null {
  const last = chat.entries.at(-1);
  return last?.role === "assistant" ? last : null;
}
