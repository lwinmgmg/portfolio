"use server";

import { redirect } from "next/navigation";

import type { LoginState } from "@/app/admin/login/login-state";
import { parseLoginForm } from "@/server/auth/login-schema";
import { isAuthConfigured, login } from "@/server/services/auth-service";
import { ADMIN_HOME_PATH } from "@/server/domain/auth";

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isAuthConfigured()) {
    return { status: "error", message: "Sign-in is not configured." };
  }

  const parsed = parseLoginForm({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: null,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const result = await login(parsed.data);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "unconfigured"
          ? "Sign-in is not configured."
          : "Invalid username or password.",
    };
  }

  redirect(ADMIN_HOME_PATH);
}
