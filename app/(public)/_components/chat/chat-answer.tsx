import { Fragment } from "react";

import { ChatActivity } from "@/app/(public)/_components/chat/chat-activity";
import {
  parseAnswer,
  type AnswerBlock,
  type InlineNode,
  type ListBlock,
} from "@/app/(public)/_components/chat/chat-markdown";
import type { AssistantEntry } from "@/app/(public)/_components/chat/chat-state";
import { citationNumbers, sourceSectionLabel } from "@/app/(public)/_components/chat/chat-text";
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

// What citation chips need while an answer's tree is rendered.
type Citations = NavigateProps & {
  numbers: ReadonlyMap<string, number>;
  sources: ReadonlyMap<string, ChatSource>;
};

// An assistant answer rendered from Markdown as React elements; the model's output never
// becomes HTML.
export function ChatAnswer({ entry, onNavigate }: { entry: AssistantEntry } & NavigateProps) {
  const streaming = entry.status === "streaming";
  const blocks = parseAnswer(entry.text, streaming);
  const citations: Citations = {
    numbers: citationNumbers(entry.text, entry.sources),
    sources: new Map((entry.sources ?? []).map((source) => [source.sourceId, source])),
    onNavigate,
  };

  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <ChatActivity entry={entry} onNavigate={onNavigate} />
      {blocks.map((block, index) => (
        <Block key={index} block={block} citations={citations} />
      ))}
      {entry.status === "stopped" ? <Note>Stopped.</Note> : null}
      {entry.status === "interrupted" ? <Note>This answer is incomplete.</Note> : null}
      {entry.sources && entry.sources.length > 0 ? (
        <ChatSources sources={entry.sources} onNavigate={onNavigate} />
      ) : null}
    </div>
  );
}

function Block({ block, citations }: { block: AnswerBlock; citations: Citations }) {
  switch (block.kind) {
    case "paragraph":
      return <p className="whitespace-pre-line">{inline(block.content, citations)}</p>;
    case "heading":
      return (
        <p className="font-semibold text-zinc-950 dark:text-zinc-50">
          {inline(block.content, citations)}
        </p>
      );
    case "list":
      return <List list={block} citations={citations} />;
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-xs dark:bg-zinc-900">
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr className="border-zinc-200 dark:border-zinc-800" />;
  }
}

function List({ list, citations }: { list: ListBlock; citations: Citations }) {
  const items = list.items.map((item, index) => (
    <li key={index} className="pl-0.5">
      {inline(item.content, citations)}
      {item.lists.map((nested, nestedIndex) => (
        <List key={nestedIndex} list={nested} citations={citations} />
      ))}
    </li>
  ));
  const spacing = "mt-1 space-y-1 pl-5 marker:text-zinc-400 first:mt-0";
  return list.ordered ? (
    <ol start={list.start} className={`list-decimal ${spacing}`}>
      {items}
    </ol>
  ) : (
    <ul className={`list-disc ${spacing}`}>{items}</ul>
  );
}

function inline(nodes: readonly InlineNode[], citations: Citations): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "strong":
        return (
          <strong key={index} className="font-semibold text-zinc-950 dark:text-zinc-50">
            {inline(node.children, citations)}
          </strong>
        );
      case "em":
        return <em key={index}>{inline(node.children, citations)}</em>;
      case "code":
        return (
          <code
            key={index}
            className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800"
          >
            {node.text}
          </code>
        );
      case "link":
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className={textLink}>
            {inline(node.children, citations)}
          </a>
        );
      case "cite":
        return (
          <CitationChip
            key={index}
            number={citations.numbers.get(node.sourceId)}
            source={citations.sources.get(node.sourceId)}
            onNavigate={citations.onNavigate}
          />
        );
    }
  });
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
