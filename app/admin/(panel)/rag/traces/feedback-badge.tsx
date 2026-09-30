import type { ChatFeedback } from "@/server/domain/chat";

// The visitor's thumb on an answer. The emoji is decoration; the label carries the meaning.
export function FeedbackBadge({ feedback }: { feedback: ChatFeedback | null }) {
  if (feedback === null) return <span aria-label="No feedback">—</span>;
  return (
    <span aria-label={feedback === "up" ? "Thumbs up" : "Thumbs down"}>
      <span aria-hidden="true">{feedback === "up" ? "👍" : "👎"}</span>
    </span>
  );
}
