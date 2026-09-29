"use client";

import { useRef } from "react";

import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import type {
  GreetingLines,
  GreetingTarget,
} from "@/app/(public)/_components/robot/robot-greeting-text";
import { ROBOT_NAME } from "@/app/(public)/_components/robot/robot-mood";
import styles from "@/app/(public)/_components/robot/robot.module.css";

// What the robot says. The greeting, before or after its target link was used, or the start of
// an answer that finished while the chat was closed.
export type BubbleContent =
  | { kind: "greeting"; lines: GreetingLines; target: GreetingTarget | null; followed: boolean }
  | { kind: "answer"; preview: string };

const button = `${focusRing} rounded-md px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none`;
const primary = `${button} bg-accent text-accent-foreground hover:opacity-90`;
const secondary = `${button} border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`;

// The speech bubble above the robot. It is not modal, never takes focus, and stays until the
// visitor acts on it. It is always rendered, empty and visually hidden while closed, so its status
// line is tracked before the text arrives and a screen reader announces it.
export function RobotBubble({
  content,
  onFollow,
  onOpenChat,
  onClose,
}: {
  content: BubbleContent | null;
  // The greeting's target link was used.
  onFollow: () => void;
  onOpenChat: () => void;
  // hadFocus: focus was inside the bubble, which is going away, so the caller should place it.
  onClose: (hadFocus: boolean) => void;
}) {
  const bubble = useRef<HTMLElement>(null);

  function close() {
    onClose(bubble.current?.contains(document.activeElement) ?? false);
  }

  function followTarget() {
    // Removing the link during its own click would cancel the navigation, so the bubble changes
    // after it.
    window.setTimeout(onFollow);
  }

  const link = content?.kind === "greeting" && !content.followed ? content.target : null;

  return (
    <section
      ref={bubble}
      aria-label={content ? bubbleLabel(content) : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      className={
        content
          ? `${styles.bubble} fixed right-4 bottom-21 z-40 w-[calc(100vw-2rem)] max-w-72 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-lg md:bottom-23 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 print:hidden`
          : "sr-only"
      }
    >
      <div className="flex items-start gap-2">
        <p role="status" className="flex-1 text-sm leading-relaxed break-words">
          {content ? bubbleText(content) : ""}
        </p>
        {content ? (
          <button
            type="button"
            onClick={close}
            aria-label={content.kind === "greeting" ? "Close greeting" : "Close answer preview"}
            className={`${focusRing} -mt-1 -mr-2 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
      {content ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {link ? (
            <a href={`#${link.anchor}`} onClick={followTarget} className={primary}>
              {link.label}
            </a>
          ) : null}
          <button type="button" onClick={onOpenChat} className={link ? secondary : primary}>
            {content.kind === "greeting" ? "Ask me a question" : "Read the full answer"}
          </button>
        </div>
      ) : null}
      {content ? (
        // The tail points down at the robot's middle (56 px robot, 64 px from md).
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 right-[22px] size-3 rotate-45 border-r border-b border-zinc-200 bg-white md:right-[26px] dark:border-zinc-800 dark:bg-zinc-900"
        />
      ) : null}
    </section>
  );
}

function bubbleLabel(content: BubbleContent): string {
  return content.kind === "greeting" ? `Greeting from ${ROBOT_NAME}` : `Answer from ${ROBOT_NAME}`;
}

function bubbleText(content: BubbleContent): string {
  if (content.kind === "answer") return content.preview;
  return content.followed ? (content.lines.followUp ?? content.lines.opening) : content.lines.opening;
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
