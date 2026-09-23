"use client";

import { useActionState } from "react";

import { loginAction } from "@/app/admin/login/actions";
import type { LoginState } from "@/app/admin/login/login-state";

const initialState: LoginState = { status: "idle", message: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const usernameError = state.fieldErrors?.username?.[0];
  const passwordError = state.fieldErrors?.password?.[0];

  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <h1 className="text-lg font-semibold">Admin sign-in</h1>
      <label className="flex flex-col gap-1 text-sm">
        Username
        <input
          name="username"
          autoComplete="username"
          required
          aria-invalid={usernameError ? true : undefined}
          className="border border-gray-300 bg-white px-2 py-1 text-base text-black"
        />
      </label>
      {usernameError ? <p className="text-sm text-red-700">{usernameError}</p> : null}
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          className="border border-gray-300 bg-white px-2 py-1 text-base text-black"
        />
      </label>
      {passwordError ? <p className="text-sm text-red-700">{passwordError}</p> : null}
      {state.message ? (
        <p className={state.status === "error" ? "text-red-700" : undefined}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit bg-gray-800 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
