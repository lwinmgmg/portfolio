"use client";

import { upload } from "@vercel/blob/client";
import { useState, useSyncExternalStore, useTransition } from "react";

import { registerCvUploadAction } from "@/app/admin/(panel)/cv/actions";
import type { RegisterCvUploadState } from "@/app/admin/(panel)/cv/register-cv-state";
import { CV_PDF_MAX_BYTES } from "@/server/domain/blob-store";

const idleState: RegisterCvUploadState = { status: "idle", message: null };
const PENDING_UPLOAD_KEY = "admin-pending-cv-upload";
const PENDING_UPLOAD_EVENT = "admin-pending-cv-upload-change";

type UploadPhase = "idle" | "uploading" | "saving";
type PendingUpload = { pathname: string; filename: string };

function subscribeToPendingUpload(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PENDING_UPLOAD_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PENDING_UPLOAD_EVENT, callback);
  };
}

function readPendingUpload(): string | null {
  try {
    return sessionStorage.getItem(PENDING_UPLOAD_KEY);
  } catch {
    return null;
  }
}

function readServerPendingUpload(): undefined {
  return undefined;
}

function parsePendingUpload(value: string | null | undefined): PendingUpload | null {
  if (!value) return null;
  try {
    const saved: unknown = JSON.parse(value);
    if (
      saved !== null &&
      typeof saved === "object" &&
      "pathname" in saved &&
      typeof saved.pathname === "string" &&
      "filename" in saved &&
      typeof saved.filename === "string"
    ) {
      return { pathname: saved.pathname, filename: saved.filename };
    }
  } catch {
    // Ignore an invalid saved upload and allow a new file selection.
  }
  return null;
}

function storePendingUpload(input: PendingUpload | null) {
  try {
    if (input) {
      sessionStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(input));
    } else {
      sessionStorage.removeItem(PENDING_UPLOAD_KEY);
    }
    window.dispatchEvent(new Event(PENDING_UPLOAD_EVENT));
  } catch {
    // In-memory state still permits a retry in this page.
  }
}

export function UploadCvForm() {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<RegisterCvUploadState>(idleState);
  const [inMemoryPending, setInMemoryPending] = useState<PendingUpload | null>(null);
  const storedPending = useSyncExternalStore(
    subscribeToPendingUpload,
    readPendingUpload,
    readServerPendingUpload,
  );
  const pendingUpload = inMemoryPending ?? parsePendingUpload(storedPending);
  const [isSaving, startSaving] = useTransition();
  const busy = storedPending === undefined || phase !== "idle" || isSaving;

  function saveDraft(input: PendingUpload, form: HTMLFormElement) {
    setPhase("saving");
    startSaving(async () => {
      try {
        const result = await registerCvUploadAction(input);
        setState(result);
        if (result.status === "saved") {
          setInMemoryPending(null);
          storePendingUpload(null);
          form.reset();
        }
      } catch (error) {
        console.error(error);
        setState({ status: "error", message: "Could not save the CV. Retry saving it." });
      } finally {
        setPhase("idle");
      }
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    if (pendingUpload) {
      setState(idleState);
      saveDraft(pendingUpload, form);
      return;
    }

    const field = form.elements.namedItem("pdf");
    const file = field instanceof HTMLInputElement ? field.files?.[0] : undefined;

    if (!file) {
      setState({ status: "error", message: "Choose a PDF to upload." });
      return;
    }
    if (
      (file.type !== "" && file.type !== "application/pdf") ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setState({ status: "error", message: "Choose a PDF file." });
      return;
    }
    if (file.size > CV_PDF_MAX_BYTES) {
      setState({ status: "error", message: "The PDF must be 10 MB or smaller." });
      return;
    }

    setState(idleState);
    setPhase("uploading");
    setProgress(0);

    try {
      const blob = await upload(`cv/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/cv/upload",
        contentType: "application/pdf",
        onUploadProgress: (update) => {
          setProgress(Math.round(update.percentage));
        },
      });
      const uploaded = { pathname: blob.pathname, filename: file.name };
      setInMemoryPending(uploaded);
      storePendingUpload(uploaded);
      saveDraft(uploaded, form);
    } catch (error) {
      console.error(error);
      setPhase("idle");
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        PDF
        <input
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          disabled={busy || pendingUpload !== null}
          className="text-sm file:mr-3 file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-white file:focus-visible:outline file:focus-visible:outline-2 file:focus-visible:outline-offset-2"
        />
      </label>
      {pendingUpload && phase === "idle" && state.status !== "invalid" ? (
        <p className="text-sm">
          {pendingUpload.filename} is uploaded. Retry saving this draft before choosing another PDF.
        </p>
      ) : null}
      {phase === "uploading" ? (
        <p role="status" aria-live="polite">
          Uploading {progress}%…
        </p>
      ) : null}
      {phase === "saving" || isSaving ? (
        <p role="status" aria-live="polite">
          Saving draft…
        </p>
      ) : null}
      {state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={
            state.status === "error" || state.status === "invalid"
              ? "text-red-700"
              : undefined
          }
        >
          {state.message}
        </p>
      ) : null}
      {pendingUpload && state.status === "invalid" && phase === "idle" ? (
        <button
          type="button"
          className="w-fit text-sm underline"
          onClick={(event) => {
            setInMemoryPending(null);
            storePendingUpload(null);
            setState(idleState);
            event.currentTarget.form?.reset();
          }}
        >
          Choose another PDF
        </button>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-fit bg-gray-800 px-3 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {phase === "saving" || isSaving
          ? "Saving…"
          : phase === "uploading"
            ? "Uploading…"
            : pendingUpload
              ? "Retry save"
              : "Upload PDF"}
      </button>
    </form>
  );
}
