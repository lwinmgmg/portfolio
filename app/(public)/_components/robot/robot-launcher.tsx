"use client";

import { useRef, type Ref } from "react";

import { focusRing } from "@/app/(public)/_components/cv/cv-styles";
import { Robot } from "@/app/(public)/_components/robot/robot";
import type { RobotMood } from "@/app/(public)/_components/robot/robot-mood";
import styles from "@/app/(public)/_components/robot/robot.module.css";
import { useEyeTracking } from "@/app/(public)/_components/robot/use-eye-tracking";

// The button that opens the chat. It keeps the old button's accessible name, so a screen reader
// user still hears what it does; the robot itself is decoration.
export function RobotLauncher({
  mood,
  label,
  unread,
  tracking,
  onClick,
  ref,
}: {
  mood: RobotMood;
  label: string;
  // An answer finished while the chat was closed.
  unread: boolean;
  // Eyes follow the pointer; off while the chat panel covers the page.
  tracking: boolean;
  onClick: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  const robot = useRef<SVGSVGElement>(null);
  useEyeTracking(robot, tracking);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={unread ? `${label}, new answer` : label}
      className={`${focusRing} ${styles.launcher} fixed right-4 bottom-4 z-40 size-14 rounded-full md:size-16 print:hidden`}
    >
      <Robot ref={robot} mood={mood} className="size-full" />
      {unread ? (
        <span className="absolute top-1 right-1 size-3 rounded-full bg-accent ring-2 ring-background" />
      ) : null}
    </button>
  );
}
