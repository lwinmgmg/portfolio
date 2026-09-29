"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  browserSessionStorage,
  readGreeted,
  writeGreeted,
} from "@/app/(public)/_components/chat/chat-storage";

// Long enough for the CV to be seen first, short enough to be noticed.
const GREETING_DELAY_MS = 1_500;

// hidden: no bubble. open: the greeting. followed: the target link was used.
export type GreetingStage = "hidden" | "open" | "followed";

// The robot greets unprompted, once per tab. It never opens the chat or moves focus.
export function useGreeting(): {
  stage: GreetingStage;
  follow: () => void;
  // Closes the bubble, or cancels a greeting that has not appeared yet (the chat was opened).
  dismiss: () => void;
} {
  const [stage, setStage] = useState<GreetingStage>("hidden");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const storage = browserSessionStorage();
    if (readGreeted(storage)) return;
    const id = window.setTimeout(() => {
      timer.current = null;
      // Written as the bubble appears, so a reload in this tab does not greet again.
      writeGreeted(storage);
      setStage("open");
    }, GREETING_DELAY_MS);
    timer.current = id;
    return () => {
      window.clearTimeout(id);
      timer.current = null;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
      // The visitor found the chat by themselves, so this tab needs no greeting.
      writeGreeted(browserSessionStorage());
    }
    setStage("hidden");
  }, []);

  const follow = useCallback(() => {
    setStage((current) => (current === "open" ? "followed" : current));
  }, []);

  return { stage, follow, dismiss };
}
