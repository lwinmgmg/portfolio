import type { RagIndex } from "@/server/domain/rag";
import { isIndexBuildStalled } from "@/server/services/rag-index-service";

const tone = {
  building: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  stalled: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  active: "bg-blue-600 text-white dark:bg-blue-500",
} as const;

const badge = "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide";

export function IndexStateBadges({ index, now }: { index: RagIndex; now: Date }) {
  const state = isIndexBuildStalled(index, now) ? "stalled" : index.state;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <span className={`${badge} ${tone[state]}`}>{state}</span>
      {index.active ? <span className={`${badge} ${tone.active}`}>active</span> : null}
    </span>
  );
}
