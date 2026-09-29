"use client";

import { useRef, useState } from "react";

import { ChatComposer } from "@/app/(public)/_components/chat/chat-composer";
import { ChatMessages } from "@/app/(public)/_components/chat/chat-messages";
import { CHAT_NOTICES } from "@/app/(public)/_components/chat/chat-state";
import { useChat } from "@/app/(public)/_components/chat/use-chat";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import { answerPreview } from "@/app/(public)/_components/robot/robot-answer-preview";
import { RobotBubble, type BubbleContent } from "@/app/(public)/_components/robot/robot-bubble";
import {
  greetingLines,
  type GreetingTarget,
} from "@/app/(public)/_components/robot/robot-greeting-text";
import { RobotLauncher } from "@/app/(public)/_components/robot/robot-launcher";
import { ROBOT_NAME, robotMood } from "@/app/(public)/_components/robot/robot-mood";
import { useGreeting } from "@/app/(public)/_components/robot/use-greeting";

// Tailwind's `md`: from here the panel is a side sheet and the CV stays visible beside it.
const WIDE_VIEWPORT = "(min-width: 48rem)";

const TITLE = "Ask about my experience";

function isWide(): boolean {
  return window.matchMedia(WIDE_VIEWPORT).matches;
}

// A floating robot that opens the chat in a modal <dialog>. showModal() makes the page behind
// inert (so focus stays in the panel) and closes on Esc; focus then returns to the button.
export function ChatWidget({
  suggestions,
  ownerName,
  greetingTarget,
}: {
  suggestions: readonly string[];
  // The CV owner's first name, for the draft card ("Send to Lwin"). Null when the CV has none.
  ownerName: string | null;
  // The section the robot's greeting offers to show. Null when the CV has neither.
  greetingTarget: GreetingTarget | null;
}) {
  const { state, restore, send, stop, reset, actOnDraft } = useChat();
  const greeting = useGreeting();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // A drag that starts in the panel and ends on the backdrop must not close it.
  const pressedBackdrop = useRef(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // An answer that finished while the panel was closed, until the panel opens again.
  const [unread, setUnread] = useState(false);
  // The robot's bubble previews that answer until the visitor opens the chat or closes it.
  const [previewing, setPreviewing] = useState(false);
  const [wasStreaming, setWasStreaming] = useState(state.streaming);
  if (wasStreaming !== state.streaming) {
    setWasStreaming(state.streaming);
    if (!state.streaming && !panelOpen) {
      setUnread(true);
      setPreviewing(true);
    }
  }

  // An answer can only be asked for with the panel open, which dismisses the greeting, so the
  // two never compete for the bubble.
  const bubble: BubbleContent | null = previewing
    ? { kind: "answer", preview: answerPreview(state) }
    : greeting.stage === "hidden"
      ? null
      : {
          kind: "greeting",
          lines: greetingLines({ robotName: ROBOT_NAME, ownerName, target: greetingTarget }),
          target: greetingTarget,
          followed: greeting.stage === "followed",
        };

  // On a phone, focusing the input would open the keyboard over the suggestions.
  function focusInputIfWide() {
    if (isWide()) input.current?.focus();
  }

  function open() {
    greeting.dismiss();
    restore();
    setPanelOpen(true);
    setUnread(false);
    setPreviewing(false);
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
      <RobotLauncher
        ref={trigger}
        mood={robotMood({ chat: state, typing: false, greeting: greeting.stage !== "hidden" })}
        label={TITLE}
        unread={unread}
        tracking={!panelOpen}
        onClick={open}
      />
      <RobotBubble
        content={bubble}
        onFollow={greeting.follow}
        onOpenChat={open}
        onClose={(hadFocus) => {
          // Closing the preview keeps the unread dot: the full answer is still unread.
          greeting.dismiss();
          setPreviewing(false);
          if (hadFocus) trigger.current?.focus({ preventScroll: true });
        }}
      />
      <dialog
        ref={dialog}
        aria-labelledby="chat-title"
        onClose={() => {
          setPanelOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
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
            ownerName={ownerName}
            onDraft={(entryId, action) => void actOnDraft(entryId, action)}
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
