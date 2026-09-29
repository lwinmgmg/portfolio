import {
  contributionLabel,
  formatMs,
  formatScore,
} from "@/app/admin/(panel)/rag/_components/trace-format";
import { stageAnchor } from "@/app/admin/(panel)/rag/_components/trace-timing";
import { card, errorText, note } from "@/app/admin/(panel)/rag/rag-styles";
import type { StageDetail, StageView } from "@/server/rag/pipeline/trace-reader";
import type { TracedHit } from "@/server/rag/pipeline/trace-stages";

const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1.5 align-top";
const num = `${td} text-right tabular-nums`;
const mono = "font-mono text-xs leading-5";
const pre = `overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 ${mono} dark:bg-zinc-800`;

export function StagePanel({
  traceId,
  index,
  stage,
}: {
  traceId: string;
  index: number;
  stage: StageView;
}) {
  return (
    <section
      id={stageAnchor(traceId, index)}
      className={`scroll-mt-4 space-y-3 ${card}`}
      aria-label={`Stage ${stage.name}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono font-semibold">{stage.name}</h3>
        <span className={`${note} tabular-nums`}>{formatMs(stage.durationMs)}</span>
      </header>
      {stage.error ? <p className={errorText}>Failed: {stage.error}</p> : null}
      <StageBody detail={stage.detail} />
    </section>
  );
}

function StageBody({ detail }: { detail: StageDetail }) {
  switch (detail.kind) {
    case "route":
      return <RouteBody detail={detail} />;
    case "rewrite":
      return <RewriteBody detail={detail} />;
    case "embed":
      return (
        <p className="text-sm">
          {detail.output.count} {detail.output.count === 1 ? "query" : "queries"} embedded with{" "}
          <span className="break-all font-mono">{detail.output.model}</span> (
          {detail.output.dimensions} dimensions).
        </p>
      );
    case "search":
      return detail.output.lists.length === 0 ? (
        <p className={note}>No queries were searched.</p>
      ) : (
        <div className="space-y-4">
          {detail.output.ignoredTermsOf ? (
            <p className={note}>
              Terms of “{detail.output.ignoredTermsOf}” were left out of each query.
            </p>
          ) : null}
          {detail.output.lists.map((list) => (
            <div key={list.name} className="space-y-1.5">
              <p className="text-sm">
                <span className="font-mono font-semibold">{list.name}</span>{" "}
                <span className="text-zinc-600 dark:text-zinc-400">“{list.query}”</span>
              </p>
              <HitTable hits={list.hits} scoreLabel="Score" />
            </div>
          ))}
        </div>
      );
    case "fuse":
      return <FuseBody detail={detail} />;
    case "rerank":
      return <RerankBody detail={detail} />;
    case "filter":
      return <FilterBody detail={detail} />;
    case "raw":
      return (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">Input</p>
            <pre className={pre}>{detail.input}</pre>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Output</p>
            <pre className={pre}>{detail.output}</pre>
          </div>
        </div>
      );
  }
}

const ROUTE_OUTCOMES = {
  smalltalk: "Short-circuit: small talk",
  off_topic: "Short-circuit: off topic",
} as const;

const ROUTE_SCOPES = ["cv", "smalltalk", "off_topic"] as const;

function RouteBody({ detail }: { detail: Extract<StageDetail, { kind: "route" }> }) {
  const { input, output } = detail;
  const outcome = output.scope ? ROUTE_OUTCOMES[output.scope] : "Deferred to rewriter";
  const cutoff = `${input.minConfidence * 100}%`;
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Outcome</dt>
        <dd className="font-semibold">{outcome}</dd>
        <dt className="font-medium">Model</dt>
        <dd className="break-all font-mono">{output.model ?? input.model}</dd>
        <dt className="font-medium">Cutoff</dt>
        <dd className="tabular-nums">{input.minConfidence.toFixed(2)}</dd>
        <dt className="font-medium">History</dt>
        <dd>
          {input.historyTurns === 0
            ? "None"
            : `${input.historyTurns} ${input.historyTurns === 1 ? "turn" : "turns"}`}
        </dd>
      </dl>
      {output.probabilities ? (
        <ul className="space-y-2" aria-label="Scope probabilities">
          {ROUTE_SCOPES.map((scope) => {
            const probability = output.probabilities?.[scope] ?? 0;
            return (
              <li key={scope} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2">
                <span className="flex items-center gap-1">
                  <ScopeBadge scope={scope} />
                  {output.choice === scope ? <span className="sr-only">(chosen)</span> : null}
                </span>
                <span className="relative h-3 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${
                      output.choice === scope ? "bg-zinc-700 dark:bg-zinc-300" : "bg-zinc-400 dark:bg-zinc-500"
                    }`}
                    style={{ width: `${probability * 100}%` }}
                  />
                  {/* cv never short-circuits, so its bar has no cutoff. */}
                  {scope === "cv" ? null : (
                    <span
                      className="absolute -inset-y-1 w-0.5 bg-red-600 dark:bg-red-400"
                      style={{ left: cutoff }}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="text-right tabular-nums">{formatScore(probability)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className={note}>The red mark is the cutoff; only small talk and off topic can short-circuit.</p>
      {output.fallback ? (
        <p className={errorText}>
          The router fell back to the rewriter{output.error ? `: ${output.error}` : "."}
        </p>
      ) : null}
    </div>
  );
}

function RewriteBody({ detail }: { detail: Extract<StageDetail, { kind: "rewrite" }> }) {
  const { input, output } = detail;
  // The rewriter stores its error message as `raw` when it falls back to the message itself.
  const fallbackReason = input.mode !== "none" && typeof output.raw === "string" ? output.raw : null;
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Original</dt>
        <dd>“{input.message}”</dd>
        <dt className="font-medium">Mode</dt>
        <dd className="font-mono">{input.mode}</dd>
        <dt className="font-medium">History</dt>
        <dd>
          {input.history.length === 0
            ? "None"
            : `${input.history.length} ${input.history.length === 1 ? "turn" : "turns"}`}
        </dd>
        <dt className="font-medium">Scope</dt>
        <dd>
          <ScopeBadge scope={output.scope} />
        </dd>
      </dl>
      <div className="space-y-1">
        <p className="font-medium">Queries</p>
        <ol className="space-y-1">
          {output.queries.map((query, index) => (
            <li key={`${index}-${query}`} className="flex gap-2">
              <span className="font-mono text-xs leading-5 text-zinc-500">q{index}</span>
              <span>{query}</span>
            </li>
          ))}
        </ol>
      </div>
      {fallbackReason ? (
        <p className={errorText}>The rewriter fell back to the original message: {fallbackReason}</p>
      ) : null}
    </div>
  );
}

const scopeTone = {
  cv: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  smalltalk: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  off_topic: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
} as const;

function ScopeBadge({ scope }: { scope: keyof typeof scopeTone }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${scopeTone[scope]}`}>
      {scope}
    </span>
  );
}

function FuseBody({ detail }: { detail: Extract<StageDetail, { kind: "fuse" }> }) {
  const { total, hits } = detail.output;
  return (
    <div className="space-y-2">
      <p className={note}>
        {total} {total === 1 ? "chunk" : "chunks"} fused
        {hits.length < total ? `, top ${hits.length} kept` : ""}.
      </p>
      <TableFrame>
        <thead className="bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th scope="col" className={`${th} text-right`}>Rank</th>
            <th scope="col" className={`${th} text-right`}>RRF score</th>
            <th scope="col" className={th}>Chunk</th>
            <th scope="col" className={th}>Contributions</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <tr key={hit.chunkId} className="border-t border-zinc-200 dark:border-zinc-700">
              <td className={num}>{hit.rank}</td>
              <td className={num}>{formatScore(hit.score)}</td>
              <td className={td}>
                <ChunkLabel hit={hit} />
              </td>
              <td className={`${td} ${mono}`}>{contributionLabel(hit.contributions)}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </div>
  );
}

function RerankBody({ detail }: { detail: Extract<StageDetail, { kind: "rerank" }> }) {
  const { fallback, error, hits, ignoredName } = detail.output;
  return (
    <div className="space-y-2">
      {ignoredName ? (
        <p className={note}>“{ignoredName}” was removed from the query and each chunk.</p>
      ) : null}
      {fallback ? (
        <p className={errorText}>
          The reranker fell back to the fused order{error ? `: ${error}` : "."} Scores below are
          1 / rank, not relevance.
        </p>
      ) : null}
      {hits.length === 0 ? (
        <p className={note}>No candidates to rerank.</p>
      ) : (
        <TableFrame>
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th scope="col" className={th}>Fused → reranked</th>
              <th scope="col" className={`${th} text-right`}>Rerank score</th>
              <th scope="col" className={th}>Chunk</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((hit) => (
              <tr key={hit.chunkId} className="border-t border-zinc-200 dark:border-zinc-700">
                <td className={`${td} tabular-nums`}>
                  #{hit.fusedRank} → #{hit.rank} <RankShift from={hit.fusedRank} to={hit.rank} />
                </td>
                <td className={num}>{formatScore(hit.score)}</td>
                <td className={td}>
                  <ChunkLabel hit={hit} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}
    </div>
  );
}

function RankShift({ from, to }: { from: number; to: number }) {
  if (from === to) return null;
  const up = to < from;
  return (
    <span className={up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
      {up ? `▲${from - to}` : `▼${to - from}`}
    </span>
  );
}

function FilterBody({ detail }: { detail: Extract<StageDetail, { kind: "filter" }> }) {
  const { minRerankScore, meanRerankScore, kept, dropped } = detail.output;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Minimum rerank score {formatScore(minRerankScore)}
        {meanRerankScore === undefined ? "" : `, mean ${formatScore(meanRerankScore)}`}: kept {kept},
        dropped {dropped.length}.
      </p>
      {dropped.length > 0 ? <HitTable hits={dropped} scoreLabel="Rerank score" /> : null}
    </div>
  );
}

function HitTable({ hits, scoreLabel }: { hits: readonly TracedHit[]; scoreLabel: string }) {
  if (hits.length === 0) return <p className={note}>No hits.</p>;
  return (
    <TableFrame>
      <thead className="bg-zinc-50 dark:bg-zinc-800">
        <tr>
          <th scope="col" className={`${th} text-right`}>Rank</th>
          <th scope="col" className={`${th} text-right`}>{scoreLabel}</th>
          <th scope="col" className={th}>Chunk</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => (
          <tr key={hit.chunkId} className="border-t border-zinc-200 dark:border-zinc-700">
            <td className={num}>{hit.rank}</td>
            <td className={num}>{formatScore(hit.score)}</td>
            <td className={td}>
              <ChunkLabel hit={hit} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function ChunkLabel({ hit }: { hit: Pick<TracedHit, "title" | "entityKeys"> }) {
  return (
    <>
      <span className="font-medium">{hit.title}</span>
      <span className={`block break-all text-zinc-600 dark:text-zinc-400 ${mono}`}>
        {hit.entityKeys.join(", ")}
      </span>
    </>
  );
}

function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
