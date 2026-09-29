"use client";

import { useEffect, useRef } from "react";

import {
  draftResultText,
  sendDraftLabel,
} from "@/app/(public)/_components/chat/chat-email-text";
import {
  isDraftSendable,
  type EmailDraftCard,
} from "@/app/(public)/_components/chat/chat-state";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";

type ChatEmailDraftProps = {
  draft: EmailDraftCard;
  ownerName: string | null;
  // While the answer that drafted it is still streaming.
  disabled: boolean;
  onSend: () => void;
  onDiscard: () => void;
};

const button = `${focusRing} rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 motion-reduce:transition-none`;

// The draft under the answer that wrote it. The card is the confirmation: Send asks nothing more.
// The text is visitor- and model-written, so it is shown as plain text, never Markdown.
export function ChatEmailDraft({ draft, ownerName, disabled, onSend, onDiscard }: ChatEmailDraftProps) {
  const result = draftResultText(draft.state, ownerName);
  const resultLine = useRef<HTMLParagraphElement>(null);
  // Set by the buttons, so a restored or superseded card never takes focus.
  const acted = useRef(false);
  const sending = draft.state === "sending";
  const open = isDraftSendable(draft.state) || sending;

  // The pressed button is disabled or removed, so focus moves to the line that says what happened.
  useEffect(() => {
    if (acted.current && draftResultText(draft.state, null) !== null) resultLine.current?.focus();
  }, [draft.state]);

  function act(action: () => void) {
    acted.current = true;
    action();
  }

  return (
    <section
      aria-label="Email draft"
      className={`mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 ${
        open || draft.state === "sent" ? "" : "opacity-70"
      }`}
    >
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {ownerName ? `Email to ${ownerName}` : "Email draft"}
      </p>
      <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
        {draft.text}
      </p>
      {/* Always rendered, so screen readers track it before its text changes. */}
      <p
        ref={resultLine}
        role="status"
        tabIndex={-1}
        className={result ? "mt-2 text-sm text-zinc-600 outline-none dark:text-zinc-300" : "sr-only"}
      >
        {result}
      </p>
      {open ? (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => act(onDiscard)}
            disabled={disabled || sending}
            className={`${button} text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800`}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => act(onSend)}
            disabled={disabled || sending}
            className={`${button} bg-accent text-accent-foreground hover:opacity-90`}
          >
            {sendDraftLabel(ownerName)}
          </button>
        </div>
      ) : null}
    </section>
  );
}
