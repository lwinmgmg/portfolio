"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import type { RagActionState } from "@/app/admin/(panel)/rag/rag-action-state";
import { isChunkerKind } from "@/server/rag/indexing/chunker-kinds";
import {
  activateRagIndex,
  deleteRagIndex,
  isRagConfigured,
  RagError,
  startRagIndexBuild,
} from "@/server/rag/rag-runtime";
import { withAdmin } from "@/server/services/auth-service";

const NOT_CONFIGURED: RagActionState = {
  status: "error",
  message: "Configure the database and OpenRouter first.",
};

async function buildRagIndex(
  _previous: RagActionState,
  formData: FormData,
): Promise<RagActionState> {
  if (!isRagConfigured()) return NOT_CONFIGURED;
  const chunker = formData.get("chunker");
  if (!isChunkerKind(chunker)) return { status: "error", message: "Choose a chunker." };
  const contextualize = formData.get("contextualize") === "on";

  let run: () => Promise<unknown>;
  try {
    const job = await startRagIndexBuild({ chunker, contextualize });
    run = job.run;
  } catch (error) {
    return failure(error, "Could not start the index build.");
  }

  // The row already exists in state `building`, so the page shows it and keeps refreshing.
  after(async () => {
    try {
      await run();
    } catch (error) {
      console.error(error);
    }
    revalidatePath("/admin/rag");
  });

  revalidatePath("/admin/rag");
  return { status: "saved", message: "Index build started." };
}

async function activateIndex(
  _previous: RagActionState,
  formData: FormData,
): Promise<RagActionState> {
  return indexAction(formData, "Could not activate the index.", async (indexId) => {
    await activateRagIndex(indexId);
    return "Index activated.";
  });
}

async function deleteIndex(
  _previous: RagActionState,
  formData: FormData,
): Promise<RagActionState> {
  return indexAction(formData, "Could not delete the index.", async (indexId) => {
    await deleteRagIndex(indexId);
    return "Index deleted.";
  });
}

export const buildRagIndexAction = withAdmin(buildRagIndex);
export const activateRagIndexAction = withAdmin(activateIndex);
export const deleteRagIndexAction = withAdmin(deleteIndex);

async function indexAction(
  formData: FormData,
  failureMessage: string,
  run: (indexId: string) => Promise<string>,
): Promise<RagActionState> {
  if (!isRagConfigured()) return NOT_CONFIGURED;
  const indexId = formData.get("indexId");
  if (typeof indexId !== "string" || indexId.trim().length === 0) {
    return { status: "error", message: "Choose an index." };
  }

  let message: string;
  try {
    message = await run(indexId.trim());
  } catch (error) {
    return failure(error, failureMessage);
  }
  revalidatePath("/admin/rag");
  revalidatePath(`/admin/rag/${indexId.trim()}`);
  return { status: "saved", message };
}

// RagError messages are written for the admin; anything else is logged and hidden.
function failure(error: unknown, fallback: string): RagActionState {
  if (error instanceof RagError) return { status: "error", message: error.message };
  console.error(error);
  return { status: "error", message: fallback };
}
