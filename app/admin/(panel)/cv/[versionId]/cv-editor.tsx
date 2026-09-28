"use client";

import { useActionState, useState } from "react";

import {
  deleteCvDraftAction,
  duplicateCvAction,
  publishCvAction,
  saveCvDraftAction,
} from "@/app/admin/(panel)/cv/actions";
import { idleCvEditorState, type CvEditorState } from "@/app/admin/(panel)/cv/editor-state";
import { CvSections } from "@/app/admin/(panel)/cv/[versionId]/cv-sections";
import { CvDataSchema } from "@/server/cv/cv-schema";
import { cvFieldIssues } from "@/server/cv/cv-issues";
import type { CvData, CvFieldIssue, CvVersion } from "@/server/domain/cv";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const primaryButton = `w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const secondaryButton = `w-fit rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 ${focusRing}`;
const dangerButton = `w-fit rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950 ${focusRing}`;
const tabClass = `rounded px-4 py-1.5 text-sm font-medium ${focusRing}`;
const activeTab = "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white";
const idleTab = "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
const noteClass = "text-sm text-zinc-600 dark:text-zinc-400";
const errorClass = "text-sm text-red-700 dark:text-red-400";

type EditorTab = "form" | "json";

// Decided on the server from the service rules, so the UI and the service cannot drift.
export type CvEditorActions = {
  edit: boolean;
  publish: boolean;
  duplicate: boolean;
  delete: boolean;
};

const noIssues: readonly CvFieldIssue[] = [];

export function CvVersionEditor({
  version,
  locked,
  actions,
}: {
  version: CvVersion;
  locked: boolean;
  actions: CvEditorActions;
}) {
  // Edits belong to the version they started from. A save changes updatedAt and clears them.
  const [editedAt, setEditedAt] = useState<string | null>(null);
  const dirty = editedAt === version.updatedAt;

  return (
    <div className="space-y-4">
      {version.data ? (
        <CvDataForm
          versionId={version.id}
          initial={version.data}
          updatedAt={version.updatedAt}
          readOnly={!actions.edit}
          onEdit={() => setEditedAt(version.updatedAt)}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          This draft has no extracted CV data yet.
        </p>
      )}
      {version.status === "draft" && !actions.publish && !locked ? (
        <p className={noteClass}>Publish is available after extraction succeeds.</p>
      ) : null}
      {locked ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Extraction is still running. Editing stays closed until it finishes.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        {actions.publish ? (
          <div className="space-y-2">
            <p className={noteClass}>
              {dirty
                ? "Save your changes before publishing."
                : "Publish uses the saved CV."}
            </p>
            <PublishForm versionId={version.id} disabled={dirty} />
          </div>
        ) : null}
        {actions.duplicate ? <DuplicateForm versionId={version.id} /> : null}
        {actions.delete ? <DeleteForm versionId={version.id} /> : null}
      </div>
    </div>
  );
}

function CvDataForm({
  versionId,
  initial,
  updatedAt,
  readOnly,
  onEdit,
}: {
  versionId: string;
  initial: CvData;
  updatedAt: string;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const [state, action, pending] = useActionState(saveCvDraftAction, idleCvEditorState);
  // Kept here so the chosen tab survives the remount after a save.
  const [tab, setTab] = useState<EditorTab>("form");

  if (readOnly) {
    return (
      <EditorBody initial={initial} issues={noIssues} readOnly tab={tab} onTabChange={setTab} />
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="updatedAt" value={updatedAt} />
      <EditorBody
        key={updatedAt}
        initial={initial}
        issues={state.issues}
        readOnly={false}
        tab={tab}
        onTabChange={setTab}
        onEdit={onEdit}
      />
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-white/90 px-1 py-3 backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/90">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Save draft"}
        </button>
        <EditorMessage state={state} />
      </div>
    </form>
  );
}

function EditorBody({
  initial,
  issues,
  readOnly,
  tab,
  onTabChange,
  onEdit,
}: {
  initial: CvData;
  issues: readonly CvFieldIssue[];
  readOnly: boolean;
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onEdit?: () => void;
}) {
  const [data, setData] = useState(initial);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonIssues, setJsonIssues] = useState<readonly CvFieldIssue[]>(noIssues);
  const visibleIssues = jsonError ? jsonIssues : issues;

  function clearJsonError() {
    setJsonError(null);
    setJsonIssues(noIssues);
  }

  function changeData(next: CvData) {
    setData(next);
    onEdit?.();
  }

  function showJson() {
    if (tab === "json") return;
    setJsonText(JSON.stringify(data, null, 2));
    clearJsonError();
    onTabChange("json");
  }

  function showForm() {
    if (tab === "form") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError("CV data must be valid JSON.");
      return;
    }
    const result = CvDataSchema.safeParse(parsed);
    if (!result.success) {
      setJsonError("The CV data is invalid.");
      setJsonIssues(cvFieldIssues(result.error.issues));
      return;
    }
    setData(result.data);
    clearJsonError();
    onTabChange("form");
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="data" value={tab === "json" ? jsonText : JSON.stringify(data)} />
      <div
        role="tablist"
        aria-label="CV editor"
        className="inline-flex gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "form"}
          className={`${tabClass} ${tab === "form" ? activeTab : idleTab}`}
          onClick={showForm}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "json"}
          className={`${tabClass} ${tab === "json" ? activeTab : idleTab}`}
          onClick={showJson}
        >
          Raw JSON
        </button>
      </div>
      {jsonError ? <p className={errorClass}>{jsonError}</p> : null}
      <IssueList issues={visibleIssues} />
      {tab === "form" ? (
        <CvSections data={data} issues={visibleIssues} readOnly={readOnly} onChange={changeData} />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">CV JSON</span>
          <textarea
            value={jsonText}
            readOnly={readOnly}
            rows={24}
            spellCheck={false}
            onChange={(event) => {
              setJsonText(event.target.value);
              clearJsonError();
              onEdit?.();
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30 read-only:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:read-only:bg-zinc-900"
          />
        </label>
      )}
    </div>
  );
}

function IssueList({ issues }: { issues: readonly CvFieldIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul
      className="list-inside list-disc space-y-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      role="alert"
    >
      {issues.map((issue, index) => (
        <li key={`${issue.path}:${index}`}>
          {issue.path.length > 0 ? `${issue.path}: ${issue.message}` : issue.message}
        </li>
      ))}
    </ul>
  );
}

function EditorMessage({ state }: { state: CvEditorState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        state.status === "error" ? errorClass : "text-sm text-emerald-700 dark:text-emerald-400"
      }
    >
      {state.message}
    </p>
  );
}

function PublishForm({ versionId, disabled }: { versionId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(publishCvAction, idleCvEditorState);
  return (
    <form
      action={action}
      className="flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (!window.confirm("Publish this CV? The current published version will be archived.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="versionId" value={versionId} />
      <button type="submit" disabled={disabled || pending} className={primaryButton}>
        {pending ? "Publishing…" : "Publish"}
      </button>
      <EditorMessage state={state} />
    </form>
  );
}

function DuplicateForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(duplicateCvAction, idleCvEditorState);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <button type="submit" disabled={pending} className={secondaryButton}>
        {pending ? "Duplicating…" : "Duplicate as draft"}
      </button>
      <EditorMessage state={state} />
    </form>
  );
}

function DeleteForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(deleteCvDraftAction, idleCvEditorState);
  return (
    <form
      action={action}
      className="flex flex-col items-start gap-2"
      onSubmit={(event) => {
        if (!window.confirm("Delete this draft? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="versionId" value={versionId} />
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Deleting…" : "Delete draft"}
      </button>
      <EditorMessage state={state} />
    </form>
  );
}
