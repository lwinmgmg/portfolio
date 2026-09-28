"use client";

import { useActionState } from "react";

import { ActionMessage } from "@/app/admin/(panel)/rag/action-message";
import { activateRagIndexAction, deleteRagIndexAction } from "@/app/admin/(panel)/rag/actions";
import { idleRagActionState } from "@/app/admin/(panel)/rag/rag-action-state";
import { smallButton, smallDangerButton } from "@/app/admin/(panel)/rag/rag-styles";

export function ActivateIndexForm({ indexId }: { indexId: string }) {
  const [state, action, pending] = useActionState(activateRagIndexAction, idleRagActionState);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="indexId" value={indexId} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "Activating…" : "Activate"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function DeleteIndexForm({ indexId }: { indexId: string }) {
  const [state, action, pending] = useActionState(deleteRagIndexAction, idleRagActionState);
  return (
    <form
      action={action}
      className="flex flex-col items-start gap-1"
      onSubmit={(event) => {
        if (!window.confirm("Delete this index and its chunks? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="indexId" value={indexId} />
      <button type="submit" disabled={pending} className={smallDangerButton}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
