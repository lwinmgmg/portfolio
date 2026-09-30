import Link from "next/link";
import { notFound } from "next/navigation";

import { TraceView } from "@/app/admin/(panel)/rag/_components/trace-view";
import { link, note } from "@/app/admin/(panel)/rag/rag-styles";
import { FeedbackBadge } from "@/app/admin/(panel)/rag/traces/feedback-badge";
import { GoldenDownload } from "@/app/admin/(panel)/rag/traces/[traceId]/golden-download";
import { isRagConfigured } from "@/server/rag/rag-runtime";
import { requireAdmin } from "@/server/services/auth-service";
import { getTraceDetail } from "@/server/services/chat-runtime";

export default async function RagTracePage({ params }: { params: Promise<{ traceId: string }> }) {
  await requireAdmin();

  if (!isRagConfigured()) {
    return (
      <p>
        RAG is not configured. See <Link href="/admin/rag" className={link}>RAG</Link>.
      </p>
    );
  }

  const { traceId } = await params;
  const detail = await getTraceDetail(traceId);
  if (!detail) notFound();
  const { view, summary, golden } = detail;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <p>
        <Link href="/admin/rag/traces" className={`text-sm ${link}`}>
          ← Back to trace history
        </Link>
      </p>
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">{summary.question ?? "Trace"}</h2>
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Feedback: <FeedbackBadge feedback={summary.feedback} />
          </span>
          {summary.failedStage ? (
            <span className="text-red-700 dark:text-red-400">Failed at {summary.failedStage}</span>
          ) : null}
        </p>
        {golden ? (
          <div className="space-y-1">
            <GoldenDownload
              filename={`${golden.id}.json`}
              json={`${JSON.stringify([golden], null, 2)}\n`}
            />
            <p className={note}>
              Downloads an item for evals/cv-retrieval.golden.json. The entity keys are what
              retrieval returned: keep only the ones that should have been found.
            </p>
          </div>
        ) : null}
      </header>
      <TraceView view={view} />
    </div>
  );
}
