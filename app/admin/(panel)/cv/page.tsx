import Link from "next/link";

import { CvExtractionRefresh } from "@/app/admin/(panel)/cv/extraction-refresh";
import { RetryExtractionForm } from "@/app/admin/(panel)/cv/retry-extraction-form";
import { UploadCvForm } from "@/app/admin/(panel)/cv/upload-cv-form";
import { isDatabaseConfigured } from "@/server/db/client";
import type { CvVersion } from "@/server/domain/cv";
import { requireAdmin } from "@/server/services/auth-service";
import { canRetryExtraction, isExtractionInProgress } from "@/server/services/cv-service";
import {
  isBlobConfigured,
  isExtractionConfigured,
  listCvVersions,
} from "@/server/services/cv-runtime";

// Covers CV server actions and extraction scheduled with after().
export const maxDuration = 60;

export default async function CvAdminPage() {
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Database</h2>
        <p>
          Add <code className="font-mono">MONGODB_URI</code> and{" "}
          <code className="font-mono">MONGODB_DB</code> to{" "}
          <code className="font-mono">.env.local</code>, then restart the dev
          server. Use a replica set such as MongoDB Atlas. See{" "}
          <code className="font-mono">.env.example</code>.
        </p>
      </section>
    );
  }

  const versions = await listCvVersions();
  const blobConfigured = isBlobConfigured();
  const extractionConfigured = isExtractionConfigured();
  const now = new Date();
  const extracting = versions.some((version) => isExtractionInProgress(version, now));

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Upload CV</h2>
        {blobConfigured ? (
          <UploadCvForm />
        ) : (
          <p>
            Add <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> to{" "}
            <code className="font-mono">.env.local</code>. Pull it with{" "}
            <code className="font-mono">vercel env pull</code>. See{" "}
            <code className="font-mono">.env.example</code>.
          </p>
        )}
        {extractionConfigured ? null : (
          <p>
            Set <code className="font-mono">OPENROUTER_API_KEY</code> and the LLM settings from{" "}
            <code className="font-mono">.env.example</code> in{" "}
            <code className="font-mono">.env.local</code>, then restart the dev server. Extraction
            cannot run until those settings are valid.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">CV versions</h2>
        {extracting ? <CvExtractionRefresh /> : null}
        {versions.length === 0 ? (
          <p>No CV uploads yet.</p>
        ) : (
          <CvVersionTable versions={versions} now={now} />
        )}
      </section>
    </div>
  );
}

function CvVersionTable({ versions, now }: { versions: CvVersion[]; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300">
            <th scope="col" className="py-2 pr-4 font-medium">
              Created
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              File
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Status
            </th>
            <th scope="col" className="py-2 font-medium">
              Extraction
            </th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id} className="border-b border-gray-200">
              <td className="py-2 pr-4">{formatWhen(version.createdAt)}</td>
              <td className="py-2 pr-4">
                <Link
                  href={`/admin/cv/${version.id}`}
                  className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {version.pdf.filename}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <StatusBadge value={version.status} />
              </td>
              <td className="py-2">
                <div className="space-y-2">
                  <StatusBadge value={version.extraction.status} />
                  {canRetryExtraction(version, now) ? (
                    <>
                      <p className="max-w-md text-sm text-red-700">
                        {version.extraction.status === "running"
                          ? "Extraction stalled. Retry it."
                          : (version.extraction.error ?? "Extraction failed.")}
                      </p>
                      <RetryExtractionForm versionId={version.id} />
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
