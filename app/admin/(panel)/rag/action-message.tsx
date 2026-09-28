import type { RagActionState } from "@/app/admin/(panel)/rag/rag-action-state";
import { errorText, note } from "@/app/admin/(panel)/rag/rag-styles";

export function ActionMessage({ state }: { state: RagActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={state.status === "error" ? `max-w-xs ${errorText}` : note}
    >
      {state.message}
    </p>
  );
}
