"use client";

import { useActionState } from "react";

import { rerunExtractionAction } from "@/app/admin/(panel)/cv/actions";
import type { RerunExtractionState } from "@/app/admin/(panel)/cv/rerun-extraction-state";

const initialState: RerunExtractionState = { status: "idle", message: null };

export function RetryExtractionForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(rerunExtractionAction, initialState);

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <button
        type="submit"
        disabled={pending}
        className="w-fit bg-gray-800 px-3 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {pending ? "Extracting…" : "Retry extraction"}
      </button>
      {state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={state.status === "error" ? "max-w-md text-sm text-red-700" : "text-sm"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
