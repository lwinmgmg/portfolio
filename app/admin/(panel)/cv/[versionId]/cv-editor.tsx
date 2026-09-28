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
import type { CvData, CvVersion } from "@/server/domain/cv";

const primaryButton =
  "w-fit bg-gray-800 px-3 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
const secondaryButton =
  "w-fit border border-gray-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
const dangerButton =
  "w-fit border border-red-700 px-3 py-2 text-sm text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
const tabClass =
  "border border-gray-300 px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export function CvVersionEditor({
  version,
  locked,
}: {
  version: CvVersion;
  locked: boolean;
}) {
  const editable = version.status === "draft" && version.data !== null && !locked;
  const publishable =
    version.status === "draft" &&
    version.extraction.status === "succeeded" &&
    version.data !== null &&
    !locked;
  const duplicable = version.status !== "draft" && version.data !== null;
  const deletable = version.status === "draft";

  return (
    <div className="space-y-4">
      {version.data ? (
        <CvDataForm
          versionId={version.id}
          initial={version.data}
          updatedAt={version.updatedAt}
          readOnly={!editable}
        />
      ) : (
        <p>This draft has no extracted CV data yet.</p>
      )}
      {version.status === "draft" && !publishable && !locked ? (
        <p>Publish is available after extraction succeeds.</p>
      ) : null}
      {locked ? <p>Extraction is still running. Editing stays closed until it finishes.</p> : null}
      <div className="flex flex-wrap items-start gap-3">
        {publishable ? (
          <div className="space-y-2">
            <p className="text-sm">Save the draft before publishing. Publish uses the saved CV.</p>
            <PublishForm versionId={version.id} />
          </div>
        ) : null}
        {duplicable ? <DuplicateForm versionId={version.id} /> : null}
        {deletable ? <DeleteForm versionId={version.id} /> : null}
      </div>
    </div>
  );
}

function CvDataForm({
  versionId,
  initial,
  updatedAt,
  readOnly,
}: {
  versionId: string;
  initial: CvData;
  updatedAt: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveCvDraftAction, idleCvEditorState);

  if (readOnly) {
    return <EditorBody versionId={versionId} initial={initial} issues={state.issues} readOnly />;
  }

  return (
    <form action={action} className="space-y-4">
      <EditorBody
        key={updatedAt}
        versionId={versionId}
        initial={initial}
        issues={state.issues}
        readOnly={false}
      />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving…" : "Save draft"}
      </button>
      <EditorMessage state={state} />
    </form>
  );
}

function EditorBody({
  versionId,
  initial,
  issues,
  readOnly,
}: {
  versionId: string;
  initial: CvData;
  issues: CvEditorState["issues"];
  readOnly: boolean;
}) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonIssues, setJsonIssues] = useState<CvEditorState["issues"]>([]);
  const visibleIssues = jsonError ? jsonIssues : issues;

  function showJson() {
    if (tab === "json") return;
    setJsonText(JSON.stringify(data, null, 2));
    setJsonError(null);
    setJsonIssues([]);
    setTab("json");
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
    setJsonError(null);
    setJsonIssues([]);
    setTab("form");
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="data" value={tab === "json" ? jsonText : JSON.stringify(data)} />
      <div role="tablist" aria-label="CV editor" className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "form"}
          className={`${tabClass} ${tab === "form" ? "bg-gray-800 text-white" : "bg-white"}`}
          onClick={showForm}
        >
          Form
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "json"}
          className={`${tabClass} ${tab === "json" ? "bg-gray-800 text-white" : "bg-white"}`}
          onClick={showJson}
        >
          Raw JSON
        </button>
      </div>
      {jsonError ? <p className="text-sm text-red-700">{jsonError}</p> : null}
      <IssueList issues={visibleIssues} />
      {tab === "form" ? (
        <CvSections data={data} issues={visibleIssues} readOnly={readOnly} onChange={setData} />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          CV JSON
          <textarea
            value={jsonText}
            readOnly={readOnly}
            rows={24}
            spellCheck={false}
            onChange={(event) => {
              setJsonText(event.target.value);
              setJsonError(null);
              setJsonIssues([]);
            }}
            className="w-full border border-gray-300 bg-white px-2 py-1 font-mono text-sm text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 read-only:bg-gray-100"
          />
        </label>
      )}
    </div>
  );
}

function IssueList({ issues }: { issues: CvEditorState["issues"] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-red-700" role="alert">
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
      className={state.status === "error" ? "text-sm text-red-700" : "text-sm"}
    >
      {state.message}
    </p>
  );
}

function PublishForm({ versionId }: { versionId: string }) {
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
      <button type="submit" disabled={pending} className={primaryButton}>
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
