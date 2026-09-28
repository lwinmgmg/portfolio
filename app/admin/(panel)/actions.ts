"use server";

import { redirect } from "next/navigation";

import { ADMIN_LOGIN_PATH } from "@/server/domain/auth";
import { logout } from "@/server/services/auth-service";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect(ADMIN_LOGIN_PATH);
}
