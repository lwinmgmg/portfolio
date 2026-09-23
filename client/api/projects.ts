"use client";

import { getPublicJson } from "@/client/api/public-http";

export type PublicProject = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
};

function isPublicProject(value: unknown): value is PublicProject {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.summary === "string" &&
    (record.url === null || typeof record.url === "string")
  );
}

function isPublicProjectList(value: unknown): value is PublicProject[] {
  return Array.isArray(value) && value.every(isPublicProject);
}

export function fetchProjects(): Promise<PublicProject[]> {
  return getPublicJson("/api/public/projects", isPublicProjectList);
}

export function fetchProject(id: string): Promise<PublicProject> {
  return getPublicJson(`/api/public/projects/${encodeURIComponent(id)}`, isPublicProject);
}
