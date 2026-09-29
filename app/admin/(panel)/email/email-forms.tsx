"use client";

import { useActionState } from "react";

import { disconnectGmailAction, sendTestEmailAction } from "@/app/admin/(panel)/email/actions";
import { ActionMessage } from "@/app/admin/(panel)/rag/action-message";
import { idleRagActionState } from "@/app/admin/(panel)/rag/rag-action-state";
import { secondaryButton, smallDangerButton } from "@/app/admin/(panel)/rag/rag-styles";

export function TestEmailForm() {
  const [state, action, pending] = useActionState(sendTestEmailAction, idleRagActionState);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Sending…" : "Send test email"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function DisconnectForm() {
  const [state, action, pending] = useActionState(disconnectGmailAction, idleRagActionState);
  return (
    <form
      action={action}
      className="flex flex-col items-start gap-1"
      onSubmit={(event) => {
        if (!window.confirm("Disconnect Gmail? The chat stops offering to email you.")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" disabled={pending} className={smallDangerButton}>
        {pending ? "Disconnecting…" : "Disconnect"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
