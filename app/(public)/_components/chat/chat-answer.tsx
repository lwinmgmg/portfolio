import { Fragment } from "react";

import type { AssistantEntry } from "@/app/(public)/_components/chat/chat-state";
import {
  citationNumbers,
  parseAnswer,
  sourceSectionLabel,
  type InlinePart,
} from "@/app/(public)/_components/chat/chat-text";
import { focusRing, textLink } from "@/app/(public)/_components/cv/cv-styles";
import type { ChatSource } from "@/server/domain/chat";

const badge =
  "inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] leading-none font-semibold tabular-nums bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";

// A badge raised into the line of text, like a footnote mark.
const chip = `${badge} ml-0.5 -translate-y-1`;

type NavigateProps = {
  // Called when a source link is followed, before the browser scrolls to it.
  onNavigate: () => void;
};

// An assistant answer as plain text: the model's output is never parsed as HTML.
export function ChatAnswer({ entry, onNavigate }: { entry: AssistantEntry } & NavigateProps) {
  const streaming = entry.status === "streaming";
  const blocks = parseAnswer(entry.text, streaming);
  const numbers = citationNumbers(entry.text, entry.sources);
  const sources = new Map((entry.sources ?? []).map((source) => [source.sourceId, source]));

  const inline = (parts: readonly InlinePart[]) =>
    parts.map((part, index) =>
      part.kind === "text" ? (
        <Fragment key={index}>{part.text}</Fragment>
      ) : (
        <CitationChip
          key={index}
          number={numbers.get(part.sourceId)}
          source={sources.get(part.sourceId)}
          onNavigate={onNavigate}
        />
      ),
    );

  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      {blocks.length === 0 && streaming ? <Thinking /> : null}
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="whitespace-pre-line">
            {inline(block.parts)}
          </p>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5 marker:text-zinc-400">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
      {entry.status === "stopped" ? <Note>Stopped.</Note> : null}
      {entry.status === "interrupted" ? <Note>This answer is incomplete.</Note> : null}
      {entry.sources && entry.sources.length > 0 ? (
        <ChatSources sources={entry.sources} onNavigate={onNavigate} />
      ) : null}
    </div>
  );
}

function CitationChip({
  number,
  source,
  onNavigate,
}: { number: number | undefined; source: ChatSource | undefined } & NavigateProps) {
  // Once the sources are known, an id they do not list was not a real source.
  if (number === undefined) return null;
  if (source?.anchor) {
    return (
      <a
        href={source.anchor}
        onClick={onNavigate}
        aria-label={`Source ${number}: ${source.title}`}
        className={`${chip} ${focusRing} transition-colors hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none`}
      >
        {number}
      </a>
    );
  }
  return (
    <span className={chip}>
      <span className="sr-only">Source </span>
      {number}
    </span>
  );
}

function ChatSources({ sources, onNavigate }: { sources: readonly ChatSource[] } & NavigateProps) {
  return (
    <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sources</p>
      <ol className="mt-1 space-y-1 text-xs">
        {sources.map((source, index) => (
          <li key={source.sourceId} className="flex items-baseline gap-2">
            <span aria-hidden="true" className={badge}>
              {index + 1}
            </span>
            <span className="min-w-0">
              {source.anchor ? (
                <a href={source.anchor} onClick={onNavigate} className={textLink}>
                  {source.title}
                </a>
              ) : (
                source.title
              )}
              <span className="text-zinc-500 dark:text-zinc-400">
                {" "}
                · {sourceSectionLabel(source.section)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-500 italic dark:text-zinc-400">{children}</p>;
}

function Thinking() {
  return (
    <p className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
      <span className="sr-only">Thinking</span>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden="true"
          style={{ animationDelay: `${delay}ms` }}
          className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"
        />
      ))}
    </p>
  );
}
