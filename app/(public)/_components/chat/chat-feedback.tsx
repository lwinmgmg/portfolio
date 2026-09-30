"use client";

import type { AssistantEntry } from "@/app/(public)/_components/chat/chat-state";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import type { ChatFeedback } from "@/server/domain/chat";

const button = `${focusRing} rounded-md border px-2 py-1 text-xs transition-colors motion-reduce:transition-none`;
const idle =
  "border-zinc-200 text-zinc-600 hover:border-accent hover:text-accent dark:border-zinc-800 dark:text-zinc-400";
const chosen = "border-accent bg-accent text-accent-foreground";

// Whether the answer can be rated: finished, and stored by the server (the feedback's address).
export function canRate(entry: AssistantEntry): boolean {
  return entry.status === "done" && entry.messageIndex !== null;
}

// Thumbs under a finished answer. The pressed one shows what the server has stored.
export function ChatFeedbackButtons({
  feedback,
  onRate,
}: {
  feedback: ChatFeedback | null;
  onRate: (value: ChatFeedback) => void;
}) {
  return (
    <div role="group" aria-label="Rate this answer" className="mt-2 flex gap-1.5">
      <button
        type="button"
        aria-pressed={feedback === "up"}
        aria-label="Good answer"
        onClick={() => onRate("up")}
        className={`${button} ${feedback === "up" ? chosen : idle}`}
      >
        <span aria-hidden="true">👍</span>
      </button>
      <button
        type="button"
        aria-pressed={feedback === "down"}
        aria-label="Bad answer"
        onClick={() => onRate("down")}
        className={`${button} ${feedback === "down" ? chosen : idle}`}
      >
        <span aria-hidden="true">👎</span>
      </button>
    </div>
  );
}
