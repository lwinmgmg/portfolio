// Pure display helpers for the public CV. No React, no Next.js, so they stay unit-testable.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const YEAR_MONTH = /^(\d{4})(?:-(\d{2}))?$/;

// "2021-04" -> "Apr 2021", "2021" -> "2021". Anything else is shown as stored.
export function formatYearMonth(value: string): string {
  const match = YEAR_MONTH.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const name = month ? MONTHS[Number(month) - 1] : undefined;
  return name ? `${name} ${year}` : `${year}`;
}

export function formatDateRange(
  start: string | null,
  end: string | null,
  current = false,
): string | null {
  const from = start ? formatYearMonth(start) : null;
  const to = current ? "Present" : end ? formatYearMonth(end) : null;
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ?? to;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);
const BARE_HOST = /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/;

// CV links come from an LLM and admin edits. Only web URLs become hrefs, so a
// `javascript:` or `data:` value can never reach the page. "github.com/jane" gets https.
export function safeWebUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = BARE_HOST.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const url = new URL(candidate);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const EMAIL = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]+$/;

export function mailtoHref(email: string | null): string | null {
  const trimmed = email?.trim();
  return trimmed && EMAIL.test(trimmed) ? `mailto:${trimmed}` : null;
}

// Shortens on a word boundary and marks the cut. The result never exceeds `max`.
export function truncateText(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const slice = normalized.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max / 2 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s.,;:!?-]+$/, "")}…`;
}

export function joinPresent(parts: ReadonlyArray<string | null>, separator = " · "): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);
}
