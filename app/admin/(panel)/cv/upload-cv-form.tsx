"use client";

import { upload } from "@vercel/blob/client";
import { useState, useTransition } from "react";

import { registerCvUploadAction } from "@/app/admin/(panel)/cv/actions";
import type { RegisterCvUploadState } from "@/app/admin/(panel)/cv/register-cv-state";
import { CV_PDF_MAX_BYTES } from "@/server/domain/blob-store";

const idleState: RegisterCvUploadState = { status: "idle", message: null };

type UploadPhase = "idle" | "uploading" | "saving";

export function UploadCvForm() {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<RegisterCvUploadState>(idleState);
  const [isSaving, startSaving] = useTransition();
  const busy = phase !== "idle" || isSaving;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
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
      setPhase("saving");
      startSaving(async () => {
        try {
          const result = await registerCvUploadAction({
            pathname: blob.pathname,
            filename: file.name,
          });
          setState(result);
          if (result.status === "saved") form.reset();
        } catch (error) {
          console.error(error);
          setState({ status: "error", message: "Could not save the CV." });
        } finally {
          setPhase("idle");
        }
      });
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
          disabled={busy}
          className="text-sm file:mr-3 file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-white file:focus-visible:outline file:focus-visible:outline-2 file:focus-visible:outline-offset-2"
        />
      </label>
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
          className={state.status === "error" ? "text-red-700" : undefined}
        >
          {state.message}
        </p>
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
            : "Upload PDF"}
      </button>
    </form>
  );
}
