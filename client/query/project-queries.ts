"use client";

import { queryOptions } from "@tanstack/react-query";

import { fetchProject, fetchProjects } from "@/client/api/projects";

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

export function projectListQuery() {
  return queryOptions({
    queryKey: projectKeys.lists(),
    queryFn: fetchProjects,
  });
}

export function projectDetailQuery(id: string) {
  return queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: () => fetchProject(id),
  });
}
