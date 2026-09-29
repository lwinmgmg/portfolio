import { formatMs, timingBar } from "@/app/admin/(panel)/rag/_components/trace-format";
import { card, focusRing } from "@/app/admin/(panel)/rag/rag-styles";
import type { StageView } from "@/server/rag/pipeline/trace-reader";

export function stageAnchor(traceId: string, index: number): string {
  return `trace-${traceId}-stage-${index}`;
}

// One row per stage on a shared time axis, so overlaps and the slow stage stand out.
export function TraceTiming({
  traceId,
  stages,
  totalMs,
}: {
  traceId: string;
  stages: readonly StageView[];
  totalMs: number;
}) {
  return (
    <section className={`space-y-3 ${card}`} aria-labelledby={`${traceId}-timing`}>
      <h3 id={`${traceId}-timing`} className="font-semibold">
        Timing <span className="font-normal text-zinc-600 dark:text-zinc-400">· {formatMs(totalMs)} total</span>
      </h3>
      <ol className="space-y-1.5">
        {stages.map((stage, index) => {
          const bar = timingBar(stage, totalMs);
          return (
            <li
              key={`${stage.name}-${index}`}
              className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-xs sm:grid-cols-[9rem_1fr_5rem]"
            >
              <a
                href={`#${stageAnchor(traceId, index)}`}
                className={`truncate font-mono text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}
              >
                {stage.name}
              </a>
              <div className="relative h-3 rounded bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                <div
                  className={`absolute inset-y-0 rounded ${stage.error ? "bg-red-500" : "bg-blue-500"}`}
                  style={{ left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }}
                />
              </div>
              <span className="text-right tabular-nums">
                {formatMs(stage.durationMs)}
                {stage.error ? <span className="sr-only"> (failed)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
