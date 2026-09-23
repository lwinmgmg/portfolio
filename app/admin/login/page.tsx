import { redirect } from "next/navigation";

import { LoginForm } from "@/app/admin/login/login-form";
import { ADMIN_HOME_PATH } from "@/server/domain/auth";
import { isAuthConfigured, readSession } from "@/server/services/auth-service";

export default async function LoginPage() {
  if (!isAuthConfigured()) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-lg font-semibold">Admin sign-in</h1>
        <p className="mt-2">Sign-in is not configured.</p>
        <p className="mt-2">
          Add <code className="font-mono">ADMIN_USERNAME</code>,{" "}
          <code className="font-mono">ADMIN_PASSWORD_HASH</code>, and{" "}
          <code className="font-mono">JWT_SECRET</code> to{" "}
          <code className="font-mono">.env.local</code>, then restart the dev
          server. See <code className="font-mono">.env.example</code>.
        </p>
      </main>
    );
  }

  if (await readSession()) {
    redirect(ADMIN_HOME_PATH);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <LoginForm />
    </main>
  );
}
