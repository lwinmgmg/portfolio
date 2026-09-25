import { UploadCvForm } from "@/app/admin/(panel)/cv/upload-cv-form";
import { isDatabaseConfigured } from "@/server/db/client";
import type { CvVersion } from "@/server/domain/cv";
import { requireAdmin } from "@/server/services/auth-service";
import { isBlobConfigured, listCvVersions } from "@/server/services/cv-runtime";

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
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">CV versions</h2>
        {versions.length === 0 ? (
          <p>No CV uploads yet.</p>
        ) : (
          <CvVersionTable versions={versions} />
        )}
      </section>
    </div>
  );
}

function CvVersionTable({ versions }: { versions: CvVersion[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
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
              <td className="py-2 pr-4">{version.pdf.filename}</td>
              <td className="py-2 pr-4">
                <StatusBadge value={version.status} />
              </td>
              <td className="py-2">
                <StatusBadge value={version.extraction.status} />
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
