"use client";

import { useActionState } from "react";

import { ActionMessage } from "@/app/admin/(panel)/rag/action-message";
import { buildRagIndexAction } from "@/app/admin/(panel)/rag/actions";
import { idleRagActionState } from "@/app/admin/(panel)/rag/rag-action-state";
import { focusRing, note, primaryButton } from "@/app/admin/(panel)/rag/rag-styles";
import { CHUNKER_KINDS, CHUNKER_LABELS } from "@/server/rag/indexing/chunker-kinds";

export function BuildIndexForm({ contextModel }: { contextModel: string }) {
  const [state, action, pending] = useActionState(buildRagIndexAction, idleRagActionState);

  return (
    <form action={action} className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="rag-chunker" className="text-sm font-medium">
          Chunker
        </label>
        <select
          id="rag-chunker"
          name="chunker"
          defaultValue="structured"
          className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 ${focusRing}`}
        >
          {CHUNKER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CHUNKER_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-start gap-2">
        <input
          id="rag-contextualize"
          name="contextualize"
          type="checkbox"
          defaultChecked
          className={`mt-1 h-4 w-4 ${focusRing}`}
        />
        <div>
          <label htmlFor="rag-contextualize" className="text-sm font-medium">
            Contextualize chunks
          </label>
          <p className={note}>
            {contextModel} writes a short context for each chunk before it is embedded.
          </p>
        </div>
      </div>
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Starting…" : "Build index"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
