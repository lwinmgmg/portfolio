"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import type { CvEditorState } from "@/app/admin/(panel)/cv/editor-state";
import type { RegisterCvUploadState } from "@/app/admin/(panel)/cv/register-cv-state";
import type { RerunExtractionState } from "@/app/admin/(panel)/cv/rerun-extraction-state";
import { isDatabaseConfigured } from "@/server/db/client";
import { requireAdmin, withAdmin } from "@/server/services/auth-service";
import {
  CvError,
  deleteCvDraft,
  duplicateCvAsDraft,
  InvalidCvError,
  publishCv,
  registerCvUpload,
  runExtraction,
  saveCvDraft,
} from "@/server/services/cv-runtime";

export async function registerCvUploadAction(input: {
  pathname: string;
  filename: string;
}): Promise<RegisterCvUploadState> {
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return { status: "error", message: "Database is not configured." };
  }
  if (typeof input.pathname !== "string" || typeof input.filename !== "string") {
    return { status: "error", message: "Choose a PDF to upload." };
  }

  let versionId: string;
  let startExtraction: boolean;
  try {
    const version = await registerCvUpload({
      pathname: input.pathname,
      filename: input.filename,
    });
    versionId = version.id;
    startExtraction =
      version.extraction.status === "pending" || version.extraction.status === "failed";
  } catch (error) {
    if (error instanceof InvalidCvError) {
      if (error.cause) console.error(error.cause);
      return {
        status: error.cause ? "error" : "invalid",
        message: error.message,
      };
    }
    console.error(error);
    return { status: "error", message: "Could not save the CV." };
  }

  if (startExtraction) {
    after(async () => {
      try {
        await runExtraction(versionId);
      } catch (error) {
        console.error(error);
      }
      revalidatePath("/admin/cv");
    });
  }

  revalidatePath("/admin/cv");
  return {
    status: "saved",
    message: startExtraction
      ? "CV draft saved. Extraction is starting."
      : "CV draft saved.",
  };
}

async function rerunExtraction(
  _previous: RerunExtractionState,
  formData: FormData,
): Promise<RerunExtractionState> {
  if (!isDatabaseConfigured()) {
    return { status: "error", message: "Database is not configured." };
  }
  const versionId = formData.get("versionId");
  if (typeof versionId !== "string" || versionId.trim().length === 0) {
    return { status: "error", message: "Choose a CV version to extract." };
  }

  try {
    await runExtraction(versionId);
  } catch (error) {
    revalidatePath("/admin/cv");
    if (error instanceof CvError) {
      if (error.cause) console.error(error.cause);
      return { status: "error", message: error.message };
    }
    console.error(error);
    return { status: "error", message: "Could not extract the CV." };
  }

  revalidatePath("/admin/cv");
  return { status: "saved", message: "Extraction finished." };
}

export const rerunExtractionAction = withAdmin(rerunExtraction);

// A successful run returns the next state or a redirect target.
type EditorOutcome = CvEditorState | { redirectTo: string };

// Shared shell for the editor actions: reads the version id, checks the database, and turns
// CV errors into editor state. `redirect` stays outside the try so its signal is not caught.
function versionAction(
  failureMessage: string,
  run: (versionId: string, formData: FormData) => Promise<EditorOutcome>,
) {
  return withAdmin(async (_previous: CvEditorState, formData: FormData) => {
    const versionId = readField(formData, "versionId");
    if (!versionId) return editorError("Choose a CV version.");
    if (!isDatabaseConfigured()) return editorError("Database is not configured.");

    let outcome: EditorOutcome;
    try {
      outcome = await run(versionId, formData);
    } catch (error) {
      return editorFailure(error, failureMessage);
    }
    if ("redirectTo" in outcome) redirect(outcome.redirectTo);
    return outcome;
  });
}

export const saveCvDraftAction = versionAction(
  "Could not save the CV draft.",
  async (versionId, formData) => {
    const expectedUpdatedAt = readField(formData, "updatedAt");
    if (!expectedUpdatedAt) return editorError("Reload the page and try again.");
    const input = parseJsonField(formData, "data");
    if (input === undefined) return editorError("CV data must be valid JSON.");

    await saveCvDraft(versionId, input, expectedUpdatedAt);
    revalidatePath("/admin/cv");
    revalidatePath(`/admin/cv/${versionId}`);
    return editorSaved("Draft saved.");
  },
);

export const publishCvAction = versionAction("Could not publish the CV.", async (versionId) => {
  await publishCv(versionId);
  revalidatePath("/");
  revalidatePath("/admin/cv");
  revalidatePath(`/admin/cv/${versionId}`);
  return editorSaved("CV published.");
});

export const duplicateCvAction = versionAction(
  "Could not duplicate the CV.",
  async (versionId) => {
    const copy = await duplicateCvAsDraft(versionId);
    revalidatePath("/admin/cv");
    return { redirectTo: `/admin/cv/${copy.id}` };
  },
);

export const deleteCvDraftAction = versionAction(
  "Could not delete the CV draft.",
  async (versionId) => {
    await deleteCvDraft(versionId);
    revalidatePath("/admin/cv");
    return { redirectTo: "/admin/cv" };
  },
);

function readField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Returns undefined when the field is missing or is not JSON.
function parseJsonField(formData: FormData, name: string): unknown {
  const raw = readField(formData, name);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function editorSaved(message: string): CvEditorState {
  return { status: "saved", message, issues: [] };
}

function editorError(message: string): CvEditorState {
  return { status: "error", message, issues: [] };
}

function editorFailure(error: unknown, fallback: string): CvEditorState {
  if (error instanceof CvError) {
    if (error.cause) console.error(error.cause);
    const issues = error instanceof InvalidCvError ? error.issues : [];
    return { status: "error", message: error.message, issues };
  }
  console.error(error);
  return editorError(fallback);
}
