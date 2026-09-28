import type { CvFieldIssue } from "@/server/domain/cv";

export function cvFieldIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): CvFieldIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map((part) => String(part)).join("."),
    message: issue.message,
  }));
}

export function cvFieldMessage(issues: readonly CvFieldIssue[], path: string): string | null {
  const messages = issues
    .filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`))
    .map((issue) => issue.message);
  return messages.length > 0 ? messages.join(" ") : null;
}
