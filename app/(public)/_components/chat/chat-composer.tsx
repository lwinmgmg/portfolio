"use client";

import { useState } from "react";

import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import { CHAT_MESSAGE_MAX_CHARS } from "@/server/domain/chat";

// The counter turns amber this close to the limit.
const NEAR_LIMIT = CHAT_MESSAGE_MAX_CHARS - 50;

const button = `${focusRing} rounded-md px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none`;

type ChatComposerProps = {
  streaming: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  inputRef: React.Ref<HTMLTextAreaElement>;
};

export function ChatComposer({ streaming, onSend, onStop, inputRef }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const empty = value.trim().length === 0;

  function submit() {
    if (streaming || empty) return;
    onSend(value);
    setValue("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends and Shift+Enter adds a line. Enter that confirms an IME composition does neither.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800"
    >
      <label htmlFor="chat-input" className="sr-only">
        Your question
      </label>
      {/* Read-only rather than disabled while an answer streams, so keyboard focus stays here. */}
      <textarea
        ref={inputRef}
        id="chat-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={streaming}
        aria-disabled={streaming}
        maxLength={CHAT_MESSAGE_MAX_CHARS}
        rows={2}
        placeholder="Ask a question…"
        aria-describedby="chat-input-count chat-input-hint"
        className={`${focusRing} block w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 aria-disabled:opacity-60 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          <span
            id="chat-input-count"
            className={`tabular-nums ${value.length > NEAR_LIMIT ? "text-amber-700 dark:text-amber-400" : ""}`}
          >
            {value.length}/{CHAT_MESSAGE_MAX_CHARS}
            <span className="sr-only"> characters</span>
          </span>
          <span id="chat-input-hint" className="hidden sm:inline">
            {" "}
            · Enter to send, Shift+Enter for a new line
          </span>
        </p>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className={`${button} border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800`}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={empty}
            className={`${button} bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-40`}
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}
