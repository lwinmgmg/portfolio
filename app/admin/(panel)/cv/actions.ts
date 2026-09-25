"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import type { RegisterCvUploadState } from "@/app/admin/(panel)/cv/register-cv-state";
import type { RerunExtractionState } from "@/app/admin/(panel)/cv/rerun-extraction-state";
import { isDatabaseConfigured } from "@/server/db/client";
import { requireAdmin, withAdmin } from "@/server/services/auth-service";
import {
  InvalidCvError,
  registerCvUpload,
  runExtraction,
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
