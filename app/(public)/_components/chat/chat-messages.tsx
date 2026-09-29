"use client";

import { useEffect, useRef } from "react";

import { ChatAnswer } from "@/app/(public)/_components/chat/chat-answer";
import type { ChatEntry } from "@/app/(public)/_components/chat/chat-state";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";

// How close to the bottom (px) still counts as following the answer.
const FOLLOW_THRESHOLD = 48;

type ChatMessagesProps = {
  entries: readonly ChatEntry[];
  streaming: boolean;
  suggestions: readonly string[];
  onSuggestion: (question: string) => void;
  onNavigate: () => void;
};

export function ChatMessages({
  entries,
  streaming,
  suggestions,
  onSuggestion,
  onNavigate,
}: ChatMessagesProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // Follows the stream only while the reader is at the bottom, so scrolling up to reread is not
  // interrupted. Each new question follows again.
  const following = useRef(true);
  const lastQuestion = entries.findLast((entry) => entry.role === "user")?.id;

  useEffect(() => {
    following.current = true;
  }, [lastQuestion]);

  useEffect(() => {
    const element = scroller.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [entries]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    following.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_THRESHOLD;
  }

  return (
    <div
      ref={scroller}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
    >
      {entries.length === 0 ? (
        <div className="flex min-h-full flex-col justify-end gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ask about my experience, projects or skills. An AI assistant answers from this CV and
            links each answer to its sources. It can make mistakes.
          </p>
          <ul className="space-y-2" aria-label="Suggested questions">
            {suggestions.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => onSuggestion(question)}
                  className={`${focusRing} w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none dark:border-zinc-800 dark:text-zinc-200`}
                >
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        // aria-busy holds screen-reader announcements until the answer has finished streaming.
        <ol role="log" aria-label="Conversation" aria-busy={streaming} className="space-y-5">
          {entries.map((entry) =>
            entry.role === "user" ? (
              <li key={entry.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm break-words whitespace-pre-wrap text-accent-foreground">
                  <span className="sr-only">You: </span>
                  {entry.text}
                </p>
              </li>
            ) : (
              <li key={entry.id}>
                <span className="sr-only">Assistant: </span>
                <ChatAnswer entry={entry} onNavigate={onNavigate} />
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
