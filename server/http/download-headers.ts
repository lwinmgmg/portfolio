const ASCII_FALLBACK_FILENAME = "download";

// `attachment` with an ASCII `filename` for old clients and an RFC 5987 `filename*`
// carrying the exact UTF-8 name. Quotes, backslashes and control characters never
// reach the header.
export function attachmentDisposition(filename: string): string {
  const ascii = asciiFilename(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

// Weak comparison per RFC 9110 §13.1.2: `W/` is ignored and `*` matches any
// representation.
export function ifNoneMatchIncludes(header: string | null, etag: string): boolean {
  if (!header) return false;
  const target = stripWeak(etag);
  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === "*" || stripWeak(candidate) === target);
}

function asciiFilename(filename: string): string {
  const ascii = filename
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/["\\]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-\s]+|[-\s]+$/g, "");
  return ascii.startsWith(".") || !ascii ? ASCII_FALLBACK_FILENAME + ascii : ascii;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function stripWeak(tag: string): string {
  return tag.startsWith("W/") ? tag.slice(2) : tag;
}
