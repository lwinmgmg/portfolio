import Link from "next/link";

import { ChatConfigSummary } from "@/app/admin/(panel)/rag/playground/chat-config-summary";
import { PlaygroundForm } from "@/app/admin/(panel)/rag/playground/playground-form";
import { indexLabel } from "@/app/admin/(panel)/rag/rag-format";
import { link, note } from "@/app/admin/(panel)/rag/rag-styles";
import { RETRIEVAL_PRESETS } from "@/server/rag/pipeline/retrieval-config";
import {
  getChatRetrievalSettings,
  isRagConfigured,
  listRagIndexes,
} from "@/server/rag/rag-runtime";
import { requireAdmin } from "@/server/services/auth-service";

// Rewrite, query embedding and rerank are separate provider calls, each with its own timeout.
export const maxDuration = 60;

export default async function RagPlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ index?: string | string[] }>;
}) {
  await requireAdmin();

  if (!isRagConfigured()) {
    return (
      <p>
        RAG is not configured. See <Link href="/admin/rag" className={link}>RAG</Link>.
      </p>
    );
  }

  const [allIndexes, chatSettings] = await Promise.all([
    listRagIndexes(),
    getChatRetrievalSettings(),
  ]);
  const indexes = allIndexes.filter((index) => index.state === "ready");
  const { index: requestedId } = await searchParams;
  const requested =
    typeof requestedId === "string" ? indexes.find((index) => index.id === requestedId) : undefined;
  const initial = requested ?? indexes.find((index) => index.active) ?? indexes[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <p>
        <Link href="/admin/rag" className={`text-sm ${link}`}>
          ← Back to indexes
        </Link>
      </p>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Retrieval playground</h2>
        <p className={note}>
          Runs the chat&apos;s retrieval pipeline without generating an answer and shows every
          stage. Each run is saved as a <span className="font-mono">playground</span> trace.
          Rewriting, query embedding and reranking call OpenRouter. &ldquo;Use for chat&rdquo; saves
          the form&apos;s config for every later chat answer.
        </p>
      </header>
      <ChatConfigSummary settings={chatSettings} />
      {initial ? (
        <PlaygroundForm
          indexes={indexes.map((index) => ({ id: index.id, label: indexLabel(index) }))}
          defaultIndexId={initial.id}
          presets={RETRIEVAL_PRESETS}
          chatConfig={chatSettings.config}
        />
      ) : (
        <p>
          No index is ready to search. <Link href="/admin/rag" className={link}>Build one</Link>{" "}
          first.
        </p>
      )}
    </div>
  );
}
