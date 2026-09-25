"use server";

import { revalidatePath } from "next/cache";

import type { RegisterCvUploadState } from "@/app/admin/(panel)/cv/register-cv-state";
import { isDatabaseConfigured } from "@/server/db/client";
import { requireAdmin } from "@/server/services/auth-service";
import { InvalidCvError, registerCvUpload } from "@/server/services/cv-runtime";

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

  try {
    await registerCvUpload({ pathname: input.pathname, filename: input.filename });
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

  revalidatePath("/admin/cv");
  return { status: "saved", message: "CV draft saved." };
}
