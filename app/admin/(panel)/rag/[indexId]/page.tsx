import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/admin/(panel)/_components/auto-refresh";
import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { IndexStateBadges } from "@/app/admin/(panel)/rag/index-state-badge";
import {
  contextSummary,
  formatCost,
  formatCount,
  formatDuration,
} from "@/app/admin/(panel)/rag/rag-format";
import { card, errorText, link, note } from "@/app/admin/(panel)/rag/rag-styles";
import type { EmbeddedChunk } from "@/server/domain/rag";
import { getRagIndexWithChunks, isRagConfigured } from "@/server/rag/rag-runtime";
import { requireAdmin } from "@/server/services/auth-service";
import { isIndexBuildInProgress } from "@/server/services/rag-index-service";

export default async function RagIndexPage({
  params,
}: {
  params: Promise<{ indexId: string }>;
}) {
  await requireAdmin();
  const { indexId } = await params;

  if (!isRagConfigured()) {
    return (
      <p>
        RAG is not configured. See <Link href="/admin/rag" className={link}>RAG</Link>.
      </p>
    );
  }

  const found = await getRagIndexWithChunks(indexId);
  if (!found) notFound();
  const { index, chunks } = found;
  const now = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <p>
        <Link href="/admin/rag" className={`text-sm ${link}`}>
          ← Back to indexes
        </Link>
      </p>
      <header className={`space-y-3 ${card}`}>
        <h2 className="text-xl font-semibold">
          {index.config.chunker} index, {formatWhen(index.createdAt)}
        </h2>
        <IndexStateBadges index={index} now={now} />
        <p className={note}>
          Contextualized: {contextSummary(index.config)}. Embedding model:{" "}
          <span className="break-all">{index.config.embeddingModel}</span>.
          {index.stats
            ? ` ${formatCount(index.stats.chunks)} chunks, ${formatCount(index.stats.tokens)} tokens, ${formatDuration(index.stats.durationMs)}, cost ${formatCost(index.stats.costUsd)}.`
            : null}
        </p>
        {index.error ? <p className={errorText}>{index.error}</p> : null}
        {index.state === "ready" ? (
          <p>
            <Link
              href={`/admin/rag/playground?index=${encodeURIComponent(index.id)}`}
              className={`text-sm ${link}`}
            >
              Test retrieval on this index →
            </Link>
          </p>
        ) : null}
        {isIndexBuildInProgress(index, now) ? (
          <AutoRefresh message="This index is building." />
        ) : null}
      </header>

      {chunks.length === 0 ? (
        <p>No chunks stored.</p>
      ) : (
        <ol className="space-y-4" aria-label="Chunks">
          {chunks.map((chunk) => (
            <ChunkCard key={chunk.id} chunk={chunk} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ChunkCard({ chunk }: { chunk: EmbeddedChunk }) {
  return (
    <li className={`space-y-3 ${card}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          #{chunk.ordinal} · {chunk.title}
        </h3>
        <span className={`${note} tabular-nums`}>{formatCount(chunk.tokenCount)} tokens</span>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Section</dt>
        <dd>{chunk.section}</dd>
        <dt className="font-medium">Entities</dt>
        <dd className="break-all font-mono text-xs leading-5">{chunk.entityKeys.join(", ")}</dd>
      </dl>
      {chunk.context ? (
        <p className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="font-semibold">Context: </span>
          {chunk.context}
        </p>
      ) : (
        <p className={note}>No context.</p>
      )}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 font-mono text-xs leading-5 dark:bg-zinc-800">
        {chunk.text}
      </pre>
    </li>
  );
}
