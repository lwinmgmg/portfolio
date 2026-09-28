import Link from "next/link";
import { notFound } from "next/navigation";

import { CvExtractionRefresh } from "@/app/admin/(panel)/cv/extraction-refresh";
import { RetryExtractionForm } from "@/app/admin/(panel)/cv/retry-extraction-form";
import { CvVersionEditor } from "@/app/admin/(panel)/cv/[versionId]/cv-editor";
import { isDatabaseConfigured } from "@/server/db/client";
import { requireAdmin } from "@/server/services/auth-service";
import { canRetryExtraction, isExtractionInProgress } from "@/server/services/cv-service";
import { getCvVersion } from "@/server/services/cv-runtime";

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
    <div className="space-y-4">
      <p>
        <Link
          href="/admin/cv"
          className="text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Back to CV versions
        </Link>
      </p>
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">{version.pdf.filename}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge value={version.status} />
          <StatusBadge value={version.extraction.status} />
          <span>Updated {formatWhen(version.updatedAt)}</span>
        </div>
        {version.extraction.model ? (
          <p className="text-sm">Extracted by {version.extraction.model}.</p>
        ) : null}
        {canRetryExtraction(version, now) ? (
          <div className="space-y-2">
            <p className="max-w-md text-sm text-red-700">
              {version.extraction.status === "running"
                ? "Extraction stalled. Retry it."
                : (version.extraction.error ?? "Extraction failed.")}
            </p>
            <RetryExtractionForm versionId={version.id} />
          </div>
        ) : null}
        {locked ? <CvExtractionRefresh /> : null}
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <aside className="space-y-2 lg:sticky lg:top-4">
          <h3 className="text-sm font-medium">PDF</h3>
          <iframe
            title={`PDF preview of ${version.pdf.filename}`}
            src={`/api/admin/cv/${encodeURIComponent(version.id)}/pdf`}
            className="h-[70vh] min-h-80 w-full border border-gray-300 bg-white"
          />
        </aside>
        <CvVersionEditor version={version} locked={locked} />
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-block border border-gray-400 px-2 py-0.5 text-xs uppercase tracking-wide">
      {value}
    </span>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}
