import { connection } from "next/server";

import { CreateProjectForm } from "@/app/admin/(panel)/create-project-form";
import { isDatabaseConfigured } from "@/server/db/client";
import { requireAdmin } from "@/server/services/auth-service";
import { listProjects } from "@/server/services/project-service";

export default async function AdminPage() {
  await requireAdmin();
  await connection();

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

  const projects = await listProjects();

  return (
    <div className="space-y-8">
      <CreateProjectForm />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id} className="border border-gray-300 p-3">
                <p className="font-medium">{project.title}</p>
                <p className="mt-1 text-sm">{project.summary}</p>
                {project.url ? (
                  <a
                    className="mt-2 inline-block text-sm underline"
                    href={project.url}
                  >
                    {project.url}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
