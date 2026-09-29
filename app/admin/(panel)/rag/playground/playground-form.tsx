"use client";

import { useActionState, useState, type KeyboardEvent, type MouseEvent } from "react";

import { TraceView } from "@/app/admin/(panel)/rag/_components/trace-view";
import {
  runRetrievalPlaygroundAction,
  saveChatConfigAction,
} from "@/app/admin/(panel)/rag/playground/actions";
import { matchingPreset } from "@/app/admin/(panel)/rag/playground/playground-config";
import {
  idleChatConfigState,
  idlePlaygroundState,
} from "@/app/admin/(panel)/rag/playground/playground-state";
import {
  errorText,
  focusRing,
  note,
  primaryButton,
  secondaryButton,
} from "@/app/admin/(panel)/rag/rag-styles";
import type {
  QueryRewriteMode,
  RetrievalConfig,
  ScopeRouterKind,
  SearchMode,
} from "@/server/domain/rag";
import type { RetrievalPresetName } from "@/server/rag/pipeline/retrieval-config";
import {
  QUERY_REWRITE_MODES,
  RETRIEVAL_FIELD_LABELS,
  RETRIEVAL_NUMBER_FIELDS,
  SCOPE_ROUTERS,
  SEARCH_MODES,
  type RetrievalNumberFieldName,
} from "@/server/rag/pipeline/retrieval-config-fields";

// Must match PLAYGROUND_MESSAGE_MAX_CHARS, which the server enforces.
const MESSAGE_MAX_CHARS = 500;
const CUSTOM = "custom";
// The saved chat config, listed first in the preset select.
const CHAT_PRESET = "chat";

export type PlaygroundIndexOption = { id: string; label: string };

// Number fields stay text while typing, so a cleared field does not turn into 0.
type FormConfig = {
  rewrite: QueryRewriteMode;
  search: SearchMode;
  rerank: boolean;
  ignoreSubjectInLexical: boolean;
  ignoreSubjectInRerank: boolean;
  dropBelowMeanRerank: boolean;
  scopeRouter: ScopeRouterKind;
} & Record<RetrievalNumberFieldName, string>;

type BooleanField =
  | "rerank"
  | "ignoreSubjectInLexical"
  | "ignoreSubjectInRerank"
  | "dropBelowMeanRerank";

const NUMBER_FIELDS = Object.keys(RETRIEVAL_NUMBER_FIELDS) as RetrievalNumberFieldName[];

const HINTS: Partial<Record<keyof RetrievalConfig, string>> = {
  rewrite: "standalone resolves pronouns; multi adds up to 3 variants.",
  minRerankScore:
    "Used only when the reranker returns scores. Chunks scoring below this are dropped. If none " +
    "pass, the chat says it has no information.",
  fusedLimit: "Fused hits kept for reranking.",
  ignoreSubjectInLexical:
    "The rewriter writes the CV owner's name into the query. BM25 then favours chunks that " +
    "mention the name, not chunks that answer the question.",
  ignoreSubjectInRerank:
    "Removes the name from the query and each chunk before reranking, so chunks whose context " +
    "mentions the name score no higher for it.",
  dropBelowMeanRerank:
    "Also drops reranked chunks scoring below half the mean of this question's rerank scores. " +
    "Can drop a weakly matching chunk.",
  scopeRouter:
    "decision asks a decision model first; confident small talk and off-topic messages skip the " +
    "rewrite and retrieval.",
  minRouteConfidence:
    "Small talk and off-topic messages at or above this confidence skip retrieval. Used only " +
    "with the decision router.",
};

function toForm(config: RetrievalConfig): FormConfig {
  const numbers = Object.fromEntries(
    NUMBER_FIELDS.map((field) => [field, String(config[field])]),
  ) as Record<RetrievalNumberFieldName, string>;
  return {
    rewrite: config.rewrite,
    search: config.search,
    rerank: config.rerank,
    ignoreSubjectInLexical: config.ignoreSubjectInLexical,
    ignoreSubjectInRerank: config.ignoreSubjectInRerank,
    dropBelowMeanRerank: config.dropBelowMeanRerank,
    scopeRouter: config.scopeRouter,
    ...numbers,
  };
}

function fromForm(form: FormConfig): RetrievalConfig {
  return {
    rewrite: form.rewrite,
    search: form.search,
    rerank: form.rerank,
    candidatesPerSearch: Number(form.candidatesPerSearch),
    rrfK: Number(form.rrfK),
    fusedLimit: Number(form.fusedLimit),
    finalK: Number(form.finalK),
    minRerankScore: Number(form.minRerankScore),
    ignoreSubjectInLexical: form.ignoreSubjectInLexical,
    ignoreSubjectInRerank: form.ignoreSubjectInRerank,
    dropBelowMeanRerank: form.dropBelowMeanRerank,
    scopeRouter: form.scopeRouter,
    minRouteConfidence: Number(form.minRouteConfidence),
  };
}

const control = `rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 ${focusRing}`;
const label = "text-sm font-medium";

export function PlaygroundForm({
  indexes,
  defaultIndexId,
  presets,
  chatConfig,
}: {
  indexes: readonly PlaygroundIndexOption[];
  defaultIndexId: string;
  presets: Readonly<Record<RetrievalPresetName, Readonly<RetrievalConfig>>>;
  // The config the chat uses now. The form opens with it.
  chatConfig: Readonly<RetrievalConfig>;
}) {
  const [state, action, pending] = useActionState(
    runRetrievalPlaygroundAction,
    idlePlaygroundState,
  );
  const [saveState, saveAction, saving] = useActionState(saveChatConfigAction, idleChatConfigState);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState("");
  const [indexId, setIndexId] = useState(defaultIndexId);
  const [config, setConfig] = useState<FormConfig>(() => toForm(chatConfig));

  // First, so a chat config equal to a named preset still shows as the chat config.
  const choices: Readonly<Record<string, Readonly<RetrievalConfig>>> = {
    [CHAT_PRESET]: chatConfig,
    ...presets,
  };
  const preset = matchingPreset(fromForm(config), choices) ?? CUSTOM;

  function choosePreset(name: string) {
    const chosen = choices[name];
    if (chosen) setConfig(toForm(chosen));
  }

  function confirmSave(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm("Use this config for every chat answer from now on? It changes live answers.")) {
      event.preventDefault();
    }
  }

  function update<K extends keyof FormConfig>(field: K, value: FormConfig[K]) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  // Cmd/Ctrl+Enter runs the query from either textarea.
  function submitOnModEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="pg-message" className={label}>
              Question
            </label>
            <textarea
              id="pg-message"
              name="message"
              required
              rows={3}
              maxLength={MESSAGE_MAX_CHARS}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={submitOnModEnter}
              className={control}
              aria-describedby="pg-message-count"
            />
            <p id="pg-message-count" className={`${note} tabular-nums`}>
              {message.length}/{MESSAGE_MAX_CHARS} · ⌘/Ctrl+Enter runs
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pg-history" className={label}>
              History <span className="font-normal text-zinc-600 dark:text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="pg-history"
              name="history"
              rows={3}
              value={history}
              onChange={(event) => setHistory(event.target.value)}
              onKeyDown={submitOnModEnter}
              placeholder={"user: Where does she work now?\nassistant: At Acme [S1]."}
              className={`${control} font-mono`}
              aria-describedby="pg-history-hint"
            />
            <p id="pg-history-hint" className={note}>
              One turn per line, oldest first, starting with <code>user:</code> or{" "}
              <code>assistant:</code>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="pg-index" className={label}>
              Index
            </label>
            <select
              id="pg-index"
              name="indexId"
              value={indexId}
              onChange={(event) => setIndexId(event.target.value)}
              className={`${control} max-w-full`}
            >
              {indexes.map((index) => (
                <option key={index.id} value={index.id}>
                  {index.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="pg-preset" className={label}>
              Preset
            </label>
            <select
              id="pg-preset"
              value={preset}
              onChange={(event) => choosePreset(event.target.value)}
              className={control}
            >
              {Object.keys(choices).map((name) => (
                <option key={name} value={name}>
                  {name === CHAT_PRESET ? "Chat config" : name}
                </option>
              ))}
              <option value={CUSTOM} disabled>
                Custom
              </option>
            </select>
          </div>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <legend className="px-1 text-sm font-semibold">Retrieval config</legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ChoiceField
              field="rewrite"
              options={QUERY_REWRITE_MODES}
              value={config.rewrite}
              onChange={(value) => update("rewrite", value)}
            />
            <ChoiceField
              field="search"
              options={SEARCH_MODES}
              value={config.search}
              onChange={(value) => update("search", value)}
            />
            <ChoiceField
              field="scopeRouter"
              options={SCOPE_ROUTERS}
              value={config.scopeRouter}
              onChange={(value) => update("scopeRouter", value)}
            />
            {NUMBER_FIELDS.map((field) => (
              <NumberInput
                key={field}
                field={field}
                value={config[field]}
                onChange={(value) => update(field, value)}
              />
            ))}
            <CheckboxField
              field="rerank"
              checked={config.rerank}
              onChange={(checked) => update("rerank", checked)}
            />
            <CheckboxField
              field="ignoreSubjectInLexical"
              checked={config.ignoreSubjectInLexical}
              onChange={(checked) => update("ignoreSubjectInLexical", checked)}
            />
            <CheckboxField
              field="ignoreSubjectInRerank"
              checked={config.ignoreSubjectInRerank}
              onChange={(checked) => update("ignoreSubjectInRerank", checked)}
            />
            <CheckboxField
              field="dropBelowMeanRerank"
              checked={config.dropBelowMeanRerank}
              onChange={(checked) => update("dropBelowMeanRerank", checked)}
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Running…" : "Run retrieval"}
          </button>
          {/* Saves the config only, so the question may be empty. The server validates it. */}
          <button
            type="submit"
            formAction={saveAction}
            formNoValidate
            disabled={saving}
            onClick={confirmSave}
            className={secondaryButton}
          >
            {saving ? "Saving…" : "Use for chat"}
          </button>
          {state.message ? (
            <p
              role="status"
              aria-live="polite"
              className={state.status === "error" ? errorText : note}
            >
              {state.message}
            </p>
          ) : null}
          {saveState.message ? (
            <p
              role="status"
              aria-live="polite"
              className={saveState.status === "error" ? errorText : note}
            >
              {saveState.message}
            </p>
          ) : null}
        </div>
      </form>

      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
        {state.view ? <TraceView view={state.view} /> : null}
      </div>
    </div>
  );
}

function ChoiceField<T extends string>({
  field,
  options,
  value,
  onChange,
}: {
  field: "rewrite" | "search" | "scopeRouter";
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const hint = HINTS[field];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`pg-${field}`} className={label}>
        {RETRIEVAL_FIELD_LABELS[field]}
      </label>
      <select
        id={`pg-${field}`}
        name={field}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option === event.target.value);
          if (next) onChange(next);
        }}
        className={control}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function CheckboxField({
  field,
  checked,
  onChange,
}: {
  field: BooleanField;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const hint = HINTS[field];
  return (
    <div className="flex items-start gap-2 self-center">
      <input
        id={`pg-${field}`}
        name={field}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={hint ? `pg-${field}-hint` : undefined}
        className={`mt-0.5 h-4 w-4 ${focusRing}`}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={`pg-${field}`} className={label}>
          {RETRIEVAL_FIELD_LABELS[field]}
        </label>
        {hint ? (
          <p id={`pg-${field}-hint`} className="text-xs text-zinc-600 dark:text-zinc-400">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: RetrievalNumberFieldName;
  value: string;
  onChange: (value: string) => void;
}) {
  const { min, max, step } = RETRIEVAL_NUMBER_FIELDS[field];
  const hint = HINTS[field];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`pg-${field}`} className={label}>
        {RETRIEVAL_FIELD_LABELS[field]}
      </label>
      <input
        id={`pg-${field}`}
        name={field}
        type="number"
        inputMode={step < 1 ? "decimal" : "numeric"}
        required
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${control} tabular-nums`}
      />
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {hint ? `${hint} ` : ""}
        {min}–{max}
      </p>
    </div>
  );
}
