import Link from "next/link";

import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { formatMs } from "@/app/admin/(panel)/rag/_components/trace-format";
import { FeedbackBadge } from "@/app/admin/(panel)/rag/traces/feedback-badge";
import { link, note } from "@/app/admin/(panel)/rag/rag-styles";
import type { RetrievalTraceKind } from "@/server/domain/rag";
import { isRagConfigured } from "@/server/rag/rag-runtime";
import { requireAdmin } from "@/server/services/auth-service";
import { listTraceHistory } from "@/server/services/chat-runtime";
import type { TraceHistoryFilter } from "@/server/services/trace-history-service";

type SearchParams = { kind?: string | string[]; feedback?: string | string[] };

const KINDS: readonly RetrievalTraceKind[] = ["chat", "playground"];

// Anything but a known value is ignored, so a mistyped link shows the unfiltered list.
function filterFrom({ kind, feedback }: SearchParams): TraceHistoryFilter {
  const known = KINDS.find((candidate) => candidate === kind);
  return {
    ...(known ? { kind: known } : {}),
    ...(feedback === "down" ? { feedback: "down" as const } : {}),
  };
}

function hrefFor(filter: TraceHistoryFilter): string {
  const query = new URLSearchParams();
  if (filter.kind) query.set("kind", filter.kind);
  if (filter.feedback) query.set("feedback", filter.feedback);
  const text = query.toString();
  return text ? `/admin/rag/traces?${text}` : "/admin/rag/traces";
}

export default async function RagTracesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();

  if (!isRagConfigured()) {
    return (
      <p>
        RAG is not configured. See <Link href="/admin/rag" className={link}>RAG</Link>.
      </p>
    );
  }

  const filter = filterFrom(await searchParams);
  const rows = await listTraceHistory(filter);
  const filters: { label: string; target: TraceHistoryFilter; active: boolean }[] = [
    { label: "All", target: {}, active: !filter.kind && !filter.feedback },
    { label: "Chat", target: { kind: "chat" }, active: filter.kind === "chat" && !filter.feedback },
    { label: "Playground", target: { kind: "playground" }, active: filter.kind === "playground" },
    { label: "👎 only", target: { feedback: "down" }, active: filter.feedback === "down" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <p>
        <Link href="/admin/rag" className={`text-sm ${link}`}>
          ← Back to indexes
        </Link>
      </p>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Trace history</h2>
        <p className={note}>
          The last {rows.length} traces, newest first. Traces are kept for 30 days. Open one to see
          every stage; a chat trace also shows the answer and can be turned into a golden-set item.
        </p>
      </header>
      <nav aria-label="Filter traces" className="flex flex-wrap gap-2 text-sm">
        {filters.map((item) => (
          <Link
            key={item.label}
            href={hrefFor(item.target)}
            aria-current={item.active ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 ${
              item.active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-300 dark:border-zinc-600"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className={note}>No traces match.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-medium">Time</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Question</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Scope</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Final sources</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Total</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Answer tokens</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200 align-top dark:border-zinc-700">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {formatWhen(row.createdAt)}
                    <span className={`block ${note}`}>{row.kind}</span>
                  </td>
                  <td className="max-w-xs px-2 py-1.5">
                    <Link href={`/admin/rag/traces/${row.id}`} className={link}>
                      {row.question ?? "(question not recorded)"}
                    </Link>
                    {row.rewritten ? (
                      <span className={`block ${note}`}>→ {row.rewritten}</span>
                    ) : null}
                    {row.failedStage ? (
                      <span className="block text-sm text-red-700 dark:text-red-400">
                        Failed at {row.failedStage}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{row.scope ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    {row.sourceTitles.length > 0 ? row.sourceTitles.join(", ") : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMs(row.totalMs)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{row.answerTokens ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <FeedbackBadge feedback={row.feedback} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
