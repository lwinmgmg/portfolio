"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CreateProjectState } from "@/app/admin/(panel)/create-project-state";
import { isDatabaseConfigured } from "@/server/db/client";
import { ADMIN_LOGIN_PATH } from "@/server/domain/auth";
import { logout, withAdmin } from "@/server/services/auth-service";
import {
  createProject,
  InvalidProjectError,
} from "@/server/services/project-service";

async function saveProject(
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

const saveProjectAsAdmin = withAdmin(saveProject);

export async function createProjectAction(
  previous: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  return saveProjectAsAdmin(previous, formData);
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect(ADMIN_LOGIN_PATH);
}
