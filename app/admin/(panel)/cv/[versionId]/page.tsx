import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/admin/(panel)/_components/auto-refresh";
import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { RetryExtractionForm } from "@/app/admin/(panel)/cv/retry-extraction-form";
import { CvVersionEditor } from "@/app/admin/(panel)/cv/[versionId]/cv-editor";
import { isDatabaseConfigured } from "@/server/db/client";
import type { CvVersionStatus, ExtractionStatus } from "@/server/domain/cv";
import { requireAdmin } from "@/server/services/auth-service";
import {
  canEditCv,
  canPublishCv,
  canRetryExtraction,
  isExtractionInProgress,
} from "@/server/services/cv-service";
import { getCvVersion } from "@/server/services/cv-runtime";

// Covers the editor's server actions, including the RAG index build that publishing
// schedules with after().
export const maxDuration = 60;

export default async function CvVersionPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  await requireAdmin();
  const { versionId } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Database</h2>
        <p>
          Add <code className="font-mono">MONGODB_URI</code> and{" "}
          <code className="font-mono">MONGODB_DB</code> to{" "}
          <code className="font-mono">.env.local</code>, then restart the dev server.
        </p>
      </section>
    );
  }

  const version = await getCvVersion(versionId);
  if (!version) notFound();

  const now = new Date();
  const locked = isExtractionInProgress(version, now);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <p>
        <Link
          href="/admin/cv"
          className="text-sm font-medium text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-400"
        >
          ← Back to CV versions
        </Link>
      </p>
      <header className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <h2 className="break-all text-xl font-semibold">{version.pdf.filename}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <StatusBadge value={version.status} />
          <StatusBadge value={version.extraction.status} />
          <span>Updated {formatWhen(version.updatedAt)}</span>
        </div>
        {version.extraction.model ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Extracted by {version.extraction.model}.</p>
        ) : null}
        {canRetryExtraction(version, now) ? (
          <div className="space-y-2">
            <p className="max-w-md text-sm text-red-700 dark:text-red-400">
              {version.extraction.status === "running"
                ? "Extraction stalled. Retry it."
                : (version.extraction.error ?? "Extraction failed.")}
            </p>
            <RetryExtractionForm versionId={version.id} />
          </div>
        ) : null}
        {locked ? <AutoRefresh message="Extraction is in progress." /> : null}
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <aside className="space-y-2 lg:sticky lg:top-4">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">PDF</h3>
          <iframe
            title={`PDF preview of ${version.pdf.filename}`}
            src={`/api/admin/cv/${encodeURIComponent(version.id)}/pdf`}
            className="h-[75vh] min-h-80 w-full rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700"
          />
        </aside>
        <CvVersionEditor
          version={version}
          locked={locked}
          actions={{
            edit: canEditCv(version),
            publish: canPublishCv(version),
            duplicate: version.status !== "draft" && version.data !== null,
            delete: version.status === "draft",
          }}
        />
      </div>
    </div>
  );
}

const badgeTone: Record<CvVersionStatus | ExtractionStatus, string> = {
  draft: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  running: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  archived: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function StatusBadge({ value }: { value: CvVersionStatus | ExtractionStatus }) {
  const tone = badgeTone[value];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {value}
    </span>
  );
}
