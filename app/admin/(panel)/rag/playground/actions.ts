"use server";

import { parsePlaygroundForm } from "@/app/admin/(panel)/rag/playground/playground-input";
import type { PlaygroundState } from "@/app/admin/(panel)/rag/playground/playground-state";
import { readTrace } from "@/server/rag/pipeline/trace-reader";
import { isRagConfigured, RagError, runRetrievalPlayground } from "@/server/rag/rag-runtime";
import { withAdmin } from "@/server/services/auth-service";

async function runPlayground(
  _previous: PlaygroundState,
  formData: FormData,
): Promise<PlaygroundState> {
  if (!isRagConfigured()) {
    return { status: "error", message: "Configure the database and OpenRouter first.", view: null };
  }
  const parsed = parsePlaygroundForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message, view: null };

  let run: Awaited<ReturnType<typeof runRetrievalPlayground>>;
  try {
    run = await runRetrievalPlayground(parsed.value);
  } catch (error) {
    // RagError messages are written for the admin; anything else is logged and hidden.
    if (error instanceof RagError) return { status: "error", message: error.message, view: null };
    console.error(error);
    return { status: "error", message: "Could not run retrieval.", view: null };
  }

  const view = readTrace(run.trace);
  const notSaved = run.saved ? "" : " The trace could not be saved.";
  if (run.error) {
    return { status: "error", message: `${run.error} See the trace below.${notSaved}`, view };
  }
  const count = view.sources.length;
  return {
    status: "done",
    message: `Retrieved ${count} ${count === 1 ? "source" : "sources"} in ${Math.round(view.totalMs)} ms.${notSaved}`,
    view,
  };
}

export const runRetrievalPlaygroundAction = withAdmin(runPlayground);
