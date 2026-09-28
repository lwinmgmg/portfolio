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
    if (error instanceof InvalidCvError) {
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

async function saveCvDraftForm(
  _previous: CvEditorState,
  formData: FormData,
): Promise<CvEditorState> {
  const versionId = readVersionId(formData);
  if (!versionId) return editorErrorMessage("Choose a CV version.");
  if (!isDatabaseConfigured()) return editorErrorMessage("Database is not configured.");

  const raw = formData.get("data");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return editorErrorMessage("CV data must be valid JSON.");
  }
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return editorErrorMessage("CV data must be valid JSON.");
  }

  try {
    await saveCvDraft(versionId, input);
  } catch (error) {
    return editorFailure(error, "Could not save the CV draft.");
  }

  revalidatePath("/admin/cv");
  revalidatePath(`/admin/cv/${versionId}`);
  return { status: "saved", message: "Draft saved.", issues: [] };
}

async function publishCvForm(
  _previous: CvEditorState,
  formData: FormData,
): Promise<CvEditorState> {
  const versionId = readVersionId(formData);
  if (!versionId) return editorErrorMessage("Choose a CV version.");
  if (!isDatabaseConfigured()) return editorErrorMessage("Database is not configured.");

  try {
    await publishCv(versionId);
  } catch (error) {
    return editorFailure(error, "Could not publish the CV.");
  }

  revalidatePath("/");
  revalidatePath("/admin/cv");
  revalidatePath(`/admin/cv/${versionId}`);
  return { status: "saved", message: "CV published.", issues: [] };
}

async function duplicateCvForm(
  _previous: CvEditorState,
  formData: FormData,
): Promise<CvEditorState> {
  const versionId = readVersionId(formData);
  if (!versionId) return editorErrorMessage("Choose a CV version.");
  if (!isDatabaseConfigured()) return editorErrorMessage("Database is not configured.");

  let copyId: string;
  try {
    const copy = await duplicateCvAsDraft(versionId);
    copyId = copy.id;
  } catch (error) {
    return editorFailure(error, "Could not duplicate the CV.");
  }

  revalidatePath("/admin/cv");
  redirect(`/admin/cv/${copyId}`);
}

async function deleteCvDraftForm(
  _previous: CvEditorState,
  formData: FormData,
): Promise<CvEditorState> {
  const versionId = readVersionId(formData);
  if (!versionId) return editorErrorMessage("Choose a CV version.");
  if (!isDatabaseConfigured()) return editorErrorMessage("Database is not configured.");

  try {
    await deleteCvDraft(versionId);
  } catch (error) {
    return editorFailure(error, "Could not delete the CV draft.");
  }

  revalidatePath("/admin/cv");
  redirect("/admin/cv");
}

export const saveCvDraftAction = withAdmin(saveCvDraftForm);
export const publishCvAction = withAdmin(publishCvForm);
export const duplicateCvAction = withAdmin(duplicateCvForm);
export const deleteCvDraftAction = withAdmin(deleteCvDraftForm);

function readVersionId(formData: FormData): string | null {
  const versionId = formData.get("versionId");
  if (typeof versionId !== "string") return null;
  const trimmed = versionId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function editorErrorMessage(message: string): CvEditorState {
  return { status: "error", message, issues: [] };
}

function editorFailure(error: unknown, fallback: string): CvEditorState {
  if (error instanceof InvalidCvError) {
    if (error.cause) console.error(error.cause);
    return { status: "error", message: error.message, issues: error.issues };
  }
  console.error(error);
  return editorErrorMessage(fallback);
}
