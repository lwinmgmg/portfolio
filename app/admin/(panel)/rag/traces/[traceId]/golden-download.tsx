"use client";

import { secondaryButton } from "@/app/admin/(panel)/rag/rag-styles";

// Builds the file in the browser: the server never writes to the repo's golden file.
export function GoldenDownload({ filename, json }: { filename: string; json: string }) {
  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={download} className={secondaryButton}>
      Add to golden set
    </button>
  );
}
