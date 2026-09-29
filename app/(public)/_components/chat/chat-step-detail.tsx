import { useEffect, useRef } from "react";

import {
  contributionsText,
  formatScore,
  moreText,
  SCORE_HINTS,
  scopeLabel,
  searchScale,
  toolDetailText,
  type ScoreScale,
} from "@/app/(public)/_components/chat/chat-steps-text";
import { sourceSectionLabel } from "@/app/(public)/_components/chat/chat-text";
import { textLink } from "@/app/(public)/_components/cv/cv-styles";
import type { ChatStepDetail, ChatStepHit } from "@/server/domain/chat";

type NavigateProps = {
  // Called when a CV link is followed, before the browser scrolls to it.
  onNavigate: () => void;
};

const muted = "text-zinc-500 dark:text-zinc-400";

// The expanded result of one step. Lists, not tables, so a 375 px panel never scrolls sideways.
export function ChatStepDetailView({
  detail,
  onNavigate,
}: { detail: ChatStepDetail } & NavigateProps) {
  switch (detail.kind) {
    case "rewrite":
      return (
        <div className="space-y-1">
          <p>
            <span className={muted}>Scope:</span> {scopeLabel(detail.scope)}
          </p>
          {detail.queries.length > 0 ? (
            <>
              <p className={muted}>Searched for:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {detail.queries.map((query, index) => (
                  <li key={index} className="break-words">
                    {query}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {detail.fallback ? (
            <p className={`${muted} italic`}>
              The question could not be rewritten, so your message was used as written.
            </p>
          ) : null}
        </div>
      );
    case "embed":
      return (
        <p>
          Turned {detail.count === 1 ? "the query" : `${detail.count} queries`} into vectors of{" "}
          {detail.dimensions} numbers, to compare by meaning.
        </p>
      );
    case "search": {
      const scale = searchScale(detail.method);
      return (
        <div className="space-y-2">
          <Hint scale={scale} />
          {detail.lists.map((list, index) => (
            <div key={index}>
              <p className="break-words">
                <span className={muted}>For</span> “{list.query}”
              </p>
              {list.hits.length === 0 ? (
                <p className={muted}>No matches.</p>
              ) : (
                <HitList hits={list.hits} total={list.total} onNavigate={onNavigate}>
                  {(hit) => <ScoreText score={hit.score} scale={scale} />}
                </HitList>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "fuse":
      return (
        <div className="space-y-2">
          <Hint scale="rrf" />
          <HitList hits={detail.hits} total={detail.total} onNavigate={onNavigate}>
            {(hit) => (
              <>
                <ScoreText score={hit.score} scale="rrf" />
                <span className={`block ${muted}`}>{contributionsText(hit.contributions)}</span>
              </>
            )}
          </HitList>
        </div>
      );
    case "rerank":
      return (
        <div className="space-y-2">
          {detail.fallback ? (
            <p className={`${muted} italic`}>
              The reranker was unavailable, so the combined order was kept.
            </p>
          ) : (
            <Hint scale="rerank" />
          )}
          <HitList
            hits={detail.hits}
            total={detail.hits.length}
            onNavigate={onNavigate}
            rank={(hit) => `fused #${hit.fusedRank} → #${hit.rank}`}
          >
            {(hit) => (detail.fallback ? null : <ScoreText score={hit.score} scale="rerank" />)}
          </HitList>
        </div>
      );
    case "filter":
      return (
        <div className="space-y-2">
          <p>
            Kept {detail.kept} {detail.kept === 1 ? "chunk" : "chunks"} scoring at least{" "}
            {formatScore(detail.minScore, "rerank")}.
          </p>
          {detail.dropped.length === 0 ? (
            <p className={muted}>Nothing was dropped.</p>
          ) : (
            <>
              <p className={muted}>Dropped:</p>
              <HitList hits={detail.dropped} total={detail.dropped.length} onNavigate={onNavigate}>
                {(hit) => <ScoreText score={hit.score} scale="rerank" />}
              </HitList>
            </>
          )}
        </div>
      );
    case "reasoning":
      return null;
    case "generate":
      return (
        <p>
          {detail.sources === 0
            ? "Answered without CV sources."
            : `Answered from ${detail.sources} ${detail.sources === 1 ? "source" : "sources"}.`}
        </p>
      );
    case "tool":
      return <p>{toolDetailText(detail.outcome)}</p>;
  }
}

// The answer model's reasoning, as plain text. While it streams it stays scrolled to the latest
// line.
export function ReasoningText({ text, streaming }: { text: string; streaming: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = box.current;
    if (element && streaming) element.scrollTop = element.scrollHeight;
  }, [text, streaming]);

  return (
    <div
      ref={box}
      className={`max-h-48 overflow-y-auto overscroll-contain break-words whitespace-pre-wrap ${muted}`}
    >
      {text}
    </div>
  );
}

function Hint({ scale }: { scale: ScoreScale }) {
  return <p className={`${muted} italic`}>{SCORE_HINTS[scale]}</p>;
}

function ScoreText({ score, scale }: { score: number; scale: ScoreScale }) {
  return <span className="tabular-nums"> · {formatScore(score, scale)}</span>;
}

function HitList<H extends ChatStepHit>({
  hits,
  total,
  onNavigate,
  rank = (hit) => `#${hit.rank}`,
  children,
}: {
  hits: readonly H[];
  total: number;
  rank?: (hit: H) => string;
  children: (hit: H) => React.ReactNode;
} & NavigateProps) {
  const more = moreText(total, hits.length);
  return (
    <>
      <ol className="mt-1 space-y-1">
        {hits.map((hit, index) => (
          <li key={index} className="break-words">
            <span className={`tabular-nums ${muted}`}>{rank(hit)}</span>{" "}
            {hit.anchor ? (
              <a href={hit.anchor} onClick={onNavigate} className={textLink}>
                {hit.title}
              </a>
            ) : (
              hit.title
            )}
            <span className={muted}> · {sourceSectionLabel(hit.section)}</span>
            {children(hit)}
          </li>
        ))}
      </ol>
      {more ? <p className={`mt-1 ${muted}`}>{more}</p> : null}
    </>
  );
}
