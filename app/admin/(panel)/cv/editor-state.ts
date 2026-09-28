import type { CvFieldIssue } from "@/server/domain/cv";

export type CvEditorState = {
  status: "idle" | "saved" | "error";
  message: string | null;
  issues: readonly CvFieldIssue[];
};

export const idleCvEditorState: CvEditorState = {
  status: "idle",
  message: null,
  issues: [],
};
