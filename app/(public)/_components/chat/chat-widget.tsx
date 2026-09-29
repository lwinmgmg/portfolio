"use client";

import { useRef } from "react";

import { ChatComposer } from "@/app/(public)/_components/chat/chat-composer";
import { ChatMessages } from "@/app/(public)/_components/chat/chat-messages";
import { CHAT_NOTICES } from "@/app/(public)/_components/chat/chat-state";
import { useChat } from "@/app/(public)/_components/chat/use-chat";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";

// Tailwind's `md`: from here the panel is a side sheet and the CV stays visible beside it.
const WIDE_VIEWPORT = "(min-width: 48rem)";

const TITLE = "Ask about my experience";

function isWide(): boolean {
  return window.matchMedia(WIDE_VIEWPORT).matches;
}

// A floating button that opens the chat in a modal <dialog>. showModal() makes the page behind
// inert (so focus stays in the panel) and closes on Esc; focus then returns to the button.
export function ChatWidget({ suggestions }: { suggestions: readonly string[] }) {
  const { state, restore, send, stop, reset } = useChat();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // A drag that starts in the panel and ends on the backdrop must not close it.
  const pressedBackdrop = useRef(false);

  // On a phone, focusing the input would open the keyboard over the suggestions.
  function focusInputIfWide() {
    if (isWide()) input.current?.focus();
  }

  function open() {
    restore();
    dialog.current?.showModal();
    focusInputIfWide();
  }

  function close() {
    dialog.current?.close();
  }

  // Source links scroll the CV. The phone panel covers the page, so it closes first.
  function handleNavigate() {
    if (!isWide()) close();
  }

  function ask(question: string) {
    void send(question);
    focusInputIfWide();
  }

  function stopAnswer() {
    stop();
    input.current?.focus();
  }

  function startOver() {
    reset();
    input.current?.focus();
  }

  const canStartOver = !state.streaming && (state.entries.length > 0 || state.conversationId !== null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className={`${focusRing} fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-medium text-accent-foreground shadow-lg transition-opacity hover:opacity-90 motion-reduce:transition-none print:hidden`}
      >
        <ChatIcon />
        {TITLE}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="chat-title"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        // A press on the dialog itself, not its content, is a press on the backdrop.
        onPointerDown={(event) => {
          pressedBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (pressedBackdrop.current && event.target === event.currentTarget) close();
        }}
        className="right-0 left-auto h-dvh max-h-none w-full max-w-none bg-white text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 md:w-[28rem] md:border-l md:border-zinc-200 md:backdrop:bg-zinc-950/20 dark:bg-zinc-950 dark:text-zinc-100 dark:md:border-zinc-800"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 id="chat-title" className="flex-1 text-sm font-semibold">
              {TITLE}
            </h2>
            <button
              type="button"
              onClick={startOver}
              disabled={!canStartOver}
              className={`${focusRing} rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800`}
            >
              New chat
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close chat"
              className={`${focusRing} rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800`}
            >
              <CloseIcon />
            </button>
          </header>
          <ChatMessages
            entries={state.entries}
            streaming={state.streaming}
            suggestions={suggestions}
            onSuggestion={ask}
            onNavigate={handleNavigate}
          />
          {state.notice ? (
            <p
              role="alert"
              className="mx-4 mb-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
            >
              {CHAT_NOTICES[state.notice]}
            </p>
          ) : null}
          <ChatComposer
            streaming={state.streaming}
            onSend={(message) => void send(message)}
            onStop={stopAnswer}
            inputRef={input}
          />
        </div>
      </dialog>
    </>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M3.5 4A1.5 1.5 0 0 1 5 2.5h10A1.5 1.5 0 0 1 16.5 4v8a1.5 1.5 0 0 1-1.5 1.5H9.2l-3.4 3.1a.5.5 0 0 1-.8-.4v-2.7A1.5 1.5 0 0 1 3.5 12V4Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
