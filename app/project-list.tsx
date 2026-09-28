"use client";

import { useQuery } from "@tanstack/react-query";

import { PublicApiError } from "@/client/api/public-http";
import { projectListQuery } from "@/client/query/project-queries";

type Blocker = "limited" | "unavailable" | "error";

export function ProjectList({
  issuanceBlocked,
  unavailable,
}: {
  issuanceBlocked: boolean;
  unavailable: boolean;
}) {
  const blockedBy: Blocker | null = unavailable
    ? "unavailable"
    : issuanceBlocked
      ? "limited"
      : null;
  const projects = useQuery({ ...projectListQuery(), enabled: blockedBy === null });

  if (blockedBy) return <BlockedMessage blocker={blockedBy} />;
  if (projects.isPending) return <p>Loading projects…</p>;
  if (projects.isError) return <BlockedMessage blocker={blockerFor(projects.error)} />;
  if (projects.data.length === 0) return <p>No projects yet.</p>;

  return (
    // The page supplies the "Side projects" heading around this list.
    <ul className="space-y-3">
      {projects.data.map((project) => (
        <li
          key={project.id}
          className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="font-medium">{project.title}</p>
          <p className="mt-1 text-sm">{project.summary}</p>
          {project.url ? (
            <a
              className="mt-2 inline-block rounded-sm text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={project.url}
            >
              {project.url}
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function BlockedMessage({ blocker }: { blocker: Blocker }) {
  if (blocker === "limited") {
    return <p>Too many new visitors right now. Wait a minute and reload.</p>;
  }
  if (blocker === "unavailable") {
    return (
      <p>
        Add <code className="font-mono">MONGODB_URI</code> and{" "}
        <code className="font-mono">MONGODB_DB</code> to{" "}
        <code className="font-mono">.env.local</code>, then restart the dev server.
      </p>
    );
  }
  return <p>Couldn&apos;t load projects.</p>;
}

function blockerFor(error: Error): Blocker {
  if (error instanceof PublicApiError) {
    if (error.kind === "limited") return "limited";
    if (error.kind === "unavailable") return "unavailable";
  }
  return "error";
}
