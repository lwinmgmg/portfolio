"use server";

import { revalidatePath } from "next/cache";

import type { CreateProjectState } from "@/app/admin/create-project-state";
import { isDatabaseConfigured } from "@/server/db/client";
import {
  createProject,
  InvalidProjectError,
} from "@/server/services/project-service";

export async function createProjectAction(
  _previous: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  if (!isDatabaseConfigured()) {
    return { status: "error", message: "Database is not configured." };
  }

  const url = String(formData.get("url") ?? "").trim();

  try {
    await createProject({
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      url: url.length > 0 ? url : null,
    });
  } catch (error) {
    if (error instanceof InvalidProjectError) {
      return { status: "error", message: error.message };
    }
    console.error(error);
    return { status: "error", message: "Could not save the project." };
  }

  revalidatePath("/admin");
  return { status: "saved", message: "Project saved." };
}
