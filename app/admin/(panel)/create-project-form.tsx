"use client";

import { useActionState } from "react";

import { createProjectAction } from "@/app/admin/(panel)/actions";
import type { CreateProjectState } from "@/app/admin/(panel)/create-project-state";

const initialState: CreateProjectState = { status: "idle", message: null };

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(
    createProjectAction,
    initialState,
  );

  return (
    <form action={action} className="flex max-w-xl flex-col gap-3">
      <h2 className="text-lg font-semibold">New project</h2>
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          name="title"
          required
          className="border border-gray-300 bg-white px-2 py-1 text-base text-black"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Summary
        <textarea
          name="summary"
          required
          rows={3}
          className="border border-gray-300 bg-white px-2 py-1 text-base text-black"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        URL
        <input
          name="url"
          type="url"
          placeholder="https://"
          className="border border-gray-300 bg-white px-2 py-1 text-base text-black"
        />
      </label>
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
        {pending ? "Saving…" : "Save project"}
      </button>
    </form>
  );
}
