import { useState } from "react";

import type {
  AnswerStep,
  AnswerStepStatus,
  AssistantEntry,
} from "@/app/(public)/_components/chat/chat-state";
import {
  ChatStepDetailView,
  ReasoningText,
} from "@/app/(public)/_components/chat/chat-step-detail";
import {
  activityHeading,
  stepDuration,
  stepLabel,
  stepSummary,
} from "@/app/(public)/_components/chat/chat-steps-text";
import { focusRing } from "@/app/(public)/_components/cv/cv-styles";

type NavigateProps = {
  onNavigate: () => void;
};

const summaryRow = `${focusRing} flex cursor-pointer list-none items-center gap-2 rounded-md [&::-webkit-details-marker]:hidden`;

// The work behind an answer, as it happens: one collapsible panel of step rows. It replaces the
// old "…" placeholder, so it also shows before the first step arrives.
export function ChatActivity({ entry, onNavigate }: { entry: AssistantEntry } & NavigateProps) {
  // An entry first seen settled was restored from storage; it starts closed.
  const [live] = useState(entry.status === "streaming");
  const autoOpen = live && entry.text === "";
  const [open, onToggle] = useDisclosure(autoOpen);
  const generateStarted = entry.steps.some((step) => step.name === "generate");

  if (entry.steps.length === 0) {
    return entry.status === "streaming" ? (
      <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <StatusIcon status="running" />
        {activityHeading(entry)}
      </p>
    ) : null;
  }

  return (
    <details
      open={open}
      onToggle={onToggle}
      className="group/panel rounded-lg border border-zinc-200 text-xs dark:border-zinc-800"
    >
      <summary className={`${summaryRow} px-3 py-2 text-zinc-600 dark:text-zinc-300`}>
        <Chevron group="panel" />
        <span className="min-w-0 flex-1 truncate font-medium">{activityHeading(entry)}</span>
      </summary>
      <ol className="space-y-0.5 border-t border-zinc-200 px-2 py-2 dark:border-zinc-800">
        {entry.steps.map((step) => (
          <li key={step.name}>
            {step.name === "reasoning" ? (
              <ReasoningRow
                step={step}
                text={entry.reasoning}
                autoOpen={live && !generateStarted}
              />
            ) : (
              <StepRow step={step} onNavigate={onNavigate} />
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

function StepRow({ step, onNavigate }: { step: AnswerStep } & NavigateProps) {
  const detail = step.detail;
  // "reasoning" details carry nothing; that row shows the reasoning text instead.
  if (!detail || detail.kind === "reasoning") return <RowLine step={step} />;
  return (
    <details className="group/row">
      <summary className={`${summaryRow} px-1 py-1`}>
        <RowLine step={step} expandable />
      </summary>
      <div className="mt-1 mb-2 ml-6 text-zinc-700 dark:text-zinc-300">
        <ChatStepDetailView detail={detail} onNavigate={onNavigate} />
      </div>
    </details>
  );
}

// Open while the model thinks, closed once it starts writing the answer, unless the visitor
// chose otherwise.
function ReasoningRow({
  step,
  text,
  autoOpen,
}: {
  step: AnswerStep;
  text: string;
  autoOpen: boolean;
}) {
  const [open, onToggle] = useDisclosure(autoOpen);
  if (text === "") return <RowLine step={step} />;
  return (
    <details open={open} onToggle={onToggle} className="group/row">
      <summary className={`${summaryRow} px-1 py-1`}>
        <RowLine step={step} expandable />
      </summary>
      <div className="mt-1 mb-2 ml-6">
        <ReasoningText text={text} streaming={step.status === "running"} />
      </div>
    </details>
  );
}

function RowLine({ step, expandable = false }: { step: AnswerStep; expandable?: boolean }) {
  const summary = stepSummary(step);
  const duration = stepDuration(step);
  return (
    <span className={`flex min-w-0 flex-1 items-center gap-2 ${expandable ? "" : "px-1 py-1"}`}>
      <StatusIcon status={step.status} />
      <span className="shrink-0 text-zinc-800 dark:text-zinc-200">{stepLabel(step)}</span>
      <span className="min-w-0 flex-1 truncate text-zinc-500 dark:text-zinc-400">{summary}</span>
      {duration ? (
        <span className="shrink-0 text-zinc-500 tabular-nums dark:text-zinc-400">{duration}</span>
      ) : null}
      {expandable ? <Chevron group="row" /> : <span aria-hidden="true" className="size-3 shrink-0" />}
    </span>
  );
}

// A <details> whose open state follows `auto` until the visitor toggles it; then their choice
// wins. React sets `open` itself too, and that also fires `toggle`, so only a toggle that
// leaves the element different from what was rendered counts as the visitor's.
function useDisclosure(auto: boolean) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? auto;
  function onToggle(event: React.ToggleEvent<HTMLDetailsElement>) {
    const now = event.currentTarget.open;
    if (now !== open) setChosen(now);
  }
  return [open, onToggle] as const;
}

const STATUS_TEXT: Record<AnswerStepStatus, string> = {
  running: "In progress",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

function StatusIcon({ status }: { status: AnswerStepStatus }) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
      <span className="sr-only">{STATUS_TEXT[status]}: </span>
      <StatusGlyph status={status} />
    </span>
  );
}

function StatusGlyph({ status }: { status: AnswerStepStatus }) {
  switch (status) {
    case "running":
      // A ring with one bright arc; static under reduced motion.
      return (
        <span
          aria-hidden="true"
          className="size-3 animate-spin rounded-full border-[1.5px] border-zinc-300 border-t-accent motion-reduce:animate-none dark:border-zinc-700 dark:border-t-accent"
        />
      );
    case "done":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 text-accent">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      );
    case "failed":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5 text-red-600 dark:text-red-400">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      );
    case "stopped":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-3 text-zinc-400 dark:text-zinc-500">
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
        </svg>
      );
  }
}

// Points right when closed and down when open. Named groups keep the panel's chevron from
// turning with an open row inside it.
function Chevron({ group }: { group: "panel" | "row" }) {
  const turn = group === "panel" ? "group-open/panel:rotate-90" : "group-open/row:rotate-90";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-3 shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none ${turn}`}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}
