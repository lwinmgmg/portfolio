"use client";

const LOCK_NAME = "portfolio-public-session";

const SESSION_PATH = "/api/public/session";

export type PublicApiErrorKind =
  | "limited"
  | "unavailable"
  | "not_found"
  | "invalid_response"
  | "http";

export class PublicApiError extends Error {
  constructor(
    readonly kind: PublicApiErrorKind,
    readonly status: number | null,
  ) {
    super(`Public API request failed: ${kind}${status === null ? "" : ` (${status})`}`);
    this.name = "PublicApiError";
  }
}

let tail: Promise<void> = Promise.resolve();

// Every request rotates the session cookie, so requests must never overlap
// (across tabs too, via Web Locks) or the losing request carries a dead key.
async function withSessionLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, work);
  }

  const previous = tail;
  let release = () => {};
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

// Deliberately takes no AbortSignal: aborting after the server rotated the key
// would drop the replacement cookie and force a fresh session issuance.
function sessionFetch(path: string): Promise<Response> {
  return withSessionLock(async () => {
    const first = await fetch(path, { cache: "no-store", credentials: "same-origin" });
    if (first.status !== 401) return first;

    const issued = await fetch(SESSION_PATH, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!issued.ok) return issued;
    return fetch(path, { cache: "no-store", credentials: "same-origin" });
  });
}

function errorKindFor(status: number): PublicApiErrorKind {
  switch (status) {
    case 404:
      return "not_found";
    case 429:
      return "limited";
    case 503:
      return "unavailable";
    default:
      return "http";
  }
}

export async function getPublicJson<T>(
  path: string,
  parse: (body: unknown) => body is T,
): Promise<T> {
  const response = await sessionFetch(path);
  if (!response.ok) throw new PublicApiError(errorKindFor(response.status), response.status);

  const body: unknown = await response.json().catch(() => undefined);
  if (!parse(body)) throw new PublicApiError("invalid_response", response.status);
  return body;
}
