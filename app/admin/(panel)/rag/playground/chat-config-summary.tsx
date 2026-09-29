import { formatWhen } from "@/app/admin/(panel)/_components/format-when";
import { configRows } from "@/app/admin/(panel)/rag/playground/playground-config";
import { card, note } from "@/app/admin/(panel)/rag/rag-styles";
import type { ChatRetrievalSettings } from "@/server/domain/rag";

// What the public chat retrieves with right now.
export function ChatConfigSummary({ settings }: { settings: ChatRetrievalSettings }) {
  return (
    <section aria-labelledby="chat-config-heading" className={`${card} space-y-2`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="chat-config-heading" className="text-sm font-semibold">
          Chat uses
        </h3>
        <p className={note}>
          {settings.updatedAt ? `Saved ${formatWhen(settings.updatedAt)}` : "Defaults (never saved)"}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {configRows(settings.config).map(({ label, value }) => (
          <div key={label} className="flex min-w-0 flex-col">
            <dt className="text-xs text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
