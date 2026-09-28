const FALLBACK_FILENAME = "CV.pdf";

// "Jane Doe" -> "Jane-Doe-CV.pdf". Keeps letters and digits in any script, so the
// result can be non-ASCII; HTTP headers need an ASCII fallback (see attachmentDisposition).
export function cvDownloadFilename(fullName: string | null | undefined): string {
  const stem = (fullName ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return stem ? `${stem}-CV.pdf` : FALLBACK_FILENAME;
}
