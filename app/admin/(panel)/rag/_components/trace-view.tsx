import Link from "next/link";

import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { formatMs, formatScore } from "@/app/admin/(panel)/rag/_components/trace-format";
import { StagePanel } from "@/app/admin/(panel)/rag/_components/trace-stage-panel";
import { TraceTiming } from "@/app/admin/(panel)/rag/_components/trace-timing";
import { card, link, note } from "@/app/admin/(panel)/rag/rag-styles";
import type { QueryScope, RetrievalConfig, TraceSource } from "@/server/domain/rag";
import type { TraceView as TraceViewModel } from "@/server/rag/pipeline/trace-reader";
import { RETRIEVAL_FIELD_LABELS } from "@/server/rag/pipeline/retrieval-config-fields";

// A whole retrieval trace: summary, timing, one panel per stage, then the final sources.
export function TraceView({ view }: { view: TraceViewModel }) {
  const scope = finalScope(view);

  return (
    <div className="space-y-4">
      <TraceSummary view={view} />
      <TraceTiming traceId={view.id} stages={view.stages} totalMs={view.totalMs} />
      {view.stages.map((stage, index) => (
        <StagePanel key={`${stage.name}-${index}`} traceId={view.id} index={index} stage={stage} />
      ))}
      <FinalSources traceId={view.id} sources={view.sources} scope={scope} />
    </div>
  );
}

function TraceSummary({ view }: { view: TraceViewModel }) {
  return (
    <section className={`space-y-3 ${card}`} aria-label="Trace summary">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Trace</dt>
        <dd className="break-all font-mono text-xs leading-5">{view.id}</dd>
        <dt className="font-medium">Kind</dt>
        <dd>{view.kind}</dd>
        <dt className="font-medium">Run</dt>
        <dd>
          {formatWhen(view.createdAt)}, {formatMs(view.totalMs)}
        </dd>
        <dt className="font-medium">Index</dt>
        <dd className="break-all font-mono text-xs leading-5">
          {view.indexId ? (
            <Link href={`/admin/rag/${view.indexId}`} className={link}>
              {view.indexId}
            </Link>
          ) : (
            "—"
          )}
        </dd>
      </dl>
      <ConfigList config={view.config} />
    </section>
  );
}

function ConfigList({ config }: { config: RetrievalConfig }) {
  const entries = Object.entries(RETRIEVAL_FIELD_LABELS) as [keyof RetrievalConfig, string][];
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Retrieval config">
      {entries.map(([field, label]) => (
        <li
          key={field}
          className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-700"
        >
          {label}: <span className="font-mono">{String(config[field])}</span>
        </li>
      ))}
    </ul>
  );
}

// A router short-circuit decides the scope before any rewrite; otherwise the rewriter does.
function finalScope(view: TraceViewModel): QueryScope {
  for (const { detail } of view.stages) {
    if (detail.kind === "route" && detail.output.scope !== null) return detail.output.scope;
    if (detail.kind === "rewrite") return detail.output.scope;
  }
  return "cv";
}

const SKIPPED_NOTES: Record<QueryScope, string> = {
  cv: "No sources were returned.",
  smalltalk: "Small talk: retrieval was skipped.",
  off_topic: "Off-topic message: retrieval was skipped.",
};

function FinalSources({
  traceId,
  sources,
  scope,
}: {
  traceId: string;
  sources: readonly TraceSource[];
  scope: QueryScope;
}) {
  return (
    <section className="space-y-3" aria-labelledby={`${traceId}-sources`}>
      <h3 id={`${traceId}-sources`} className="font-semibold">
        Final sources
      </h3>
      {sources.length === 0 ? (
        <p className={note}>
          {SKIPPED_NOTES[scope]}
        </p>
      ) : (
        <ol className="space-y-3">
          {sources.map((source) => (
            <li key={source.sourceId} className={`space-y-2 ${card}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  <span className="mr-2 rounded bg-blue-600 px-1.5 py-0.5 font-mono text-xs text-white dark:bg-blue-500">
                    {source.sourceId}
                  </span>
                  {source.title}
                </p>
                <p className={`${note} tabular-nums`}>
                  fused {formatScore(source.fusedScore)} · rerank {formatScore(source.rerankScore)}
                </p>
              </div>
              <p className="break-all font-mono text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                {source.section} · {source.entityKeys.join(", ")}
              </p>
              {source.context ? (
                <p className="text-sm italic text-zinc-500 dark:text-zinc-400">{source.context}</p>
              ) : null}
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 font-mono text-xs leading-5 dark:bg-zinc-800">
                {source.text}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
