"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import {
  shouldCloseOnScroll,
  type GreetingLines,
  type GreetingTarget,
} from "@/app/(public)/_components/robot/robot-greeting-text";
import { ROBOT_NAME } from "@/app/(public)/_components/robot/robot-mood";
import styles from "@/app/(public)/_components/robot/robot.module.css";
import type { GreetingStage } from "@/app/(public)/_components/robot/use-greeting";

// Tailwind's `md`, as in the chat widget. Below it the bubble covers the CV text.
const WIDE_VIEWPORT = "(min-width: 48rem)";

// The target link scrolls smoothly, so the phone rule's start point is taken once scrolling stops.
const SETTLE_MS = 150;

const button = `${focusRing} rounded-md px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none`;
const primary = `${button} bg-accent text-accent-foreground hover:opacity-90`;
const secondary = `${button} border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`;

// The speech bubble above the robot. It is not modal and never takes focus. It is always rendered,
// empty and visually hidden while closed, so its status line is tracked before the greeting
// arrives and a screen reader announces it.
export function RobotGreeting({
  stage,
  lines,
  target,
  onFollow,
  onAsk,
  onClose,
}: {
  stage: GreetingStage;
  lines: GreetingLines;
  target: GreetingTarget | null;
  onFollow: () => void;
  onAsk: () => void;
  // hadFocus: focus was inside the bubble, which is going away, so the caller should place it.
  onClose: (hadFocus: boolean) => void;
}) {
  const bubble = useRef<HTMLElement>(null);
  // Set while the bubble is shown: restarts the phone scroll rule from where the link lands.
  const restartScrollRule = useRef<() => void>(() => {});
  const shown = stage !== "hidden";
  const followed = stage === "followed";

  function close() {
    onClose(bubble.current?.contains(document.activeElement) ?? false);
  }

  const closeOnScroll = useEffectEvent(close);

  useEffect(() => {
    if (!shown) return;
    const wide = window.matchMedia(WIDE_VIEWPORT);
    let startY: number | null = window.scrollY;
    let settle = 0;

    const settleLater = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        startY = window.scrollY;
      }, SETTLE_MS);
    };

    const onScroll = () => {
      if (startY === null) settleLater();
      else if (!wide.matches && shouldCloseOnScroll(startY, window.scrollY, window.innerHeight)) {
        closeOnScroll();
      }
    };

    restartScrollRule.current = () => {
      startY = null;
      settleLater();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(settle);
      restartScrollRule.current = () => {};
    };
  }, [shown]);

  function followTarget() {
    restartScrollRule.current();
    // Removing the link during its own click would cancel the navigation, so the bubble changes
    // after it.
    window.setTimeout(onFollow);
  }

  return (
    <section
      ref={bubble}
      aria-label={shown ? `Greeting from ${ROBOT_NAME}` : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      className={
        shown
          ? `${styles.bubble} fixed right-4 bottom-21 z-40 w-[calc(100vw-2rem)] max-w-72 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-lg md:bottom-23 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 print:hidden`
          : "sr-only"
      }
    >
      <div className="flex items-start gap-2">
        <p role="status" className="flex-1 text-sm leading-relaxed">
          {shown ? (followed ? (lines.followUp ?? lines.opening) : lines.opening) : ""}
        </p>
        {shown ? (
          <button
            type="button"
            onClick={close}
            aria-label="Close greeting"
            className={`${focusRing} -mt-1 -mr-2 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
      {shown ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {target && !followed ? (
            <a href={`#${target.anchor}`} onClick={followTarget} className={primary}>
              {target.label}
            </a>
          ) : null}
          <button type="button" onClick={onAsk} className={target && !followed ? secondary : primary}>
            Ask me a question
          </button>
        </div>
      ) : null}
      {shown ? (
        // The tail points down at the robot's middle (56 px robot, 64 px from md).
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 right-[22px] size-3 rotate-45 border-r border-b border-zinc-200 bg-white md:right-[26px] dark:border-zinc-800 dark:bg-zinc-900"
        />
      ) : null}
    </section>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
