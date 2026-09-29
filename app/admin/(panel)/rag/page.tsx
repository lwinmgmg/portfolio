import Link from "next/link";

import { AutoRefresh } from "@/app/admin/(panel)/_components/auto-refresh";
import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { BuildIndexForm } from "@/app/admin/(panel)/rag/build-index-form";
import { ActivateIndexForm, DeleteIndexForm } from "@/app/admin/(panel)/rag/index-actions";
import { IndexStateBadges } from "@/app/admin/(panel)/rag/index-state-badge";
import {
  contextSummary,
  formatCost,
  formatCount,
  formatDuration,
} from "@/app/admin/(panel)/rag/rag-format";
import { card, errorText, link, note } from "@/app/admin/(panel)/rag/rag-styles";
import type { RagIndex } from "@/server/domain/rag";
import { isRagConfigured, listRagIndexes, ragIndexModels } from "@/server/rag/rag-runtime";
import { requireAdmin } from "@/server/services/auth-service";
import {
  canActivateIndex,
  canDeleteIndex,
  isIndexBuildInProgress,
  isIndexBuildStalled,
} from "@/server/services/rag-index-service";

// Covers the RAG server actions and the index build scheduled with after().
export const maxDuration = 60;

export default async function RagAdminPage() {
  await requireAdmin();

  if (!isRagConfigured()) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">RAG</h2>
        <p>
          Indexing needs the database (<code className="font-mono">MONGODB_URI</code>,{" "}
          <code className="font-mono">MONGODB_DB</code>) and valid OpenRouter settings (
          <code className="font-mono">OPENROUTER_API_KEY</code> and the models in{" "}
          <code className="font-mono">.env.example</code>). Add them to{" "}
          <code className="font-mono">.env.local</code>, then restart the dev server.
        </p>
      </section>
    );
  }

  const indexes = await listRagIndexes();
  const models = ragIndexModels();
  const now = new Date();
  const active = indexes.find((index) => index.active) ?? null;
  const building = indexes.some((index) => isIndexBuildInProgress(index, now));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Active index</h2>
          <Link href="/admin/rag/playground" className={`text-sm ${link}`}>
            Open the retrieval playground →
          </Link>
        </div>
        {active ? (
          <ActiveIndexSummary index={active} />
        ) : (
          <p className={note}>
            No active index. Publishing a CV builds and activates one; you can also build one below
            and activate it.
          </p>
        )}
      </section>

      <section className={`space-y-4 ${card}`}>
        <h2 className="text-lg font-semibold">Build index</h2>
        <p className={note}>
          Builds from the published CV with {models.embeddingModel}. A new index stays inactive
          until you activate it.
        </p>
        <BuildIndexForm contextModel={models.contextModel} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Indexes</h2>
        {building ? <AutoRefresh message="An index is building." /> : null}
        {indexes.length === 0 ? (
          <p>No indexes yet.</p>
        ) : (
          <IndexTable indexes={indexes} now={now} />
        )}
      </section>
    </div>
  );
}

function ActiveIndexSummary({ index }: { index: RagIndex }) {
  return (
    <dl className={`grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr] ${card}`}>
      <dt className="font-medium">Built</dt>
      <dd>{formatWhen(index.createdAt)}</dd>
      <dt className="font-medium">Chunker</dt>
      <dd>{index.config.chunker}</dd>
      <dt className="font-medium">Contextualized</dt>
      <dd>{contextSummary(index.config)}</dd>
      <dt className="font-medium">Embedding model</dt>
      <dd className="break-all">{index.config.embeddingModel}</dd>
      <dt className="font-medium">Chunks</dt>
      <dd>
        {index.stats ? formatCount(index.stats.chunks) : "—"}{" "}
        <Link href={`/admin/rag/${index.id}`} className={link}>
          View chunks
        </Link>
      </dd>
      <dt className="font-medium">CV version</dt>
      <dd className="break-all font-mono text-xs leading-5">{index.sourceId}</dd>
    </dl>
  );
}

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 align-top";

function IndexTable({ indexes, now }: { indexes: RagIndex[]; now: Date }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th scope="col" className={th}>Created</th>
            <th scope="col" className={th}>Chunker</th>
            <th scope="col" className={th}>Contextualize</th>
            <th scope="col" className={th}>Embedding model</th>
            <th scope="col" className={th}>State</th>
            <th scope="col" className={`${th} text-right`}>Chunks</th>
            <th scope="col" className={`${th} text-right`}>Tokens</th>
            <th scope="col" className={`${th} text-right`}>Duration</th>
            <th scope="col" className={`${th} text-right`}>Cost</th>
            <th scope="col" className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((index) => (
            <IndexRow key={index.id} index={index} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndexRow({ index, now }: { index: RagIndex; now: Date }) {
  const { stats } = index;
  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-700">
      <td className={td}>
        <Link href={`/admin/rag/${index.id}`} className={link}>
          {formatWhen(index.createdAt)}
        </Link>
      </td>
      <td className={td}>{index.config.chunker}</td>
      <td className={td}>{contextSummary(index.config)}</td>
      <td className={`${td} break-all`}>{index.config.embeddingModel}</td>
      <td className={td}>
        <div className="space-y-1">
          <IndexStateBadges index={index} now={now} />
          {index.error ? <p className={`max-w-xs ${errorText}`}>{index.error}</p> : null}
          {isIndexBuildStalled(index, now) ? (
            <p className={`max-w-xs ${errorText}`}>The build stopped. Delete it and build again.</p>
          ) : null}
          {stats && stats.contextFailures > 0 ? (
            <p className={`max-w-xs ${note}`}>
              {formatCount(stats.contextFailures)} chunks have no context.
            </p>
          ) : null}
        </div>
      </td>
      <td className={`${td} text-right tabular-nums`}>{stats ? formatCount(stats.chunks) : "—"}</td>
      <td className={`${td} text-right tabular-nums`}>{stats ? formatCount(stats.tokens) : "—"}</td>
      <td className={`${td} text-right tabular-nums`}>
        {stats ? formatDuration(stats.durationMs) : "—"}
      </td>
      <td className={`${td} text-right tabular-nums`}>{stats ? formatCost(stats.costUsd) : "—"}</td>
      <td className={td}>
        <div className="flex flex-wrap items-start gap-2">
          {canActivateIndex(index) ? <ActivateIndexForm indexId={index.id} /> : null}
          {canDeleteIndex(index, now) ? <DeleteIndexForm indexId={index.id} /> : null}
        </div>
      </td>
    </tr>
  );
}
