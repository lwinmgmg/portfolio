import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
/** How the owner makes a new refresh token; named in errors that need one. */
export const REFRESH_TOKEN_COMMAND = "bun run email:token";

export type PkcePair = { verifier: string; challenge: string };

/** RFC 7636 S256: a 43-character verifier and its SHA-256, both base64url. */
export function createPkcePair(random: (size: number) => Buffer = randomBytes): PkcePair {
  const verifier = random(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState(random: (size: number) => Buffer = randomBytes): string {
  return random(16).toString("base64url");
}

export function buildConsentUrl(options: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: GMAIL_SEND_SCOPE,
    // offline + consent: Google returns a refresh token even if this account consented before.
    access_type: "offline",
    prompt: "consent",
    code_challenge: options.challenge,
    code_challenge_method: "S256",
    state: options.state,
  }).toString();
  return url.toString();
}

export type ConsentCallback =
  | { kind: "code"; code: string }
  | { kind: "error"; message: string };

/** Reads Google's redirect back to the loopback server. */
export function readConsentCallback(url: URL, expectedState: string): ConsentCallback {
  const params = url.searchParams;
  if (params.get("state") !== expectedState) {
    return { kind: "error", message: "The state does not match this sign-in. Start again." };
  }
  const error = params.get("error");
  if (error) return { kind: "error", message: `Google returned "${error}".` };
  const code = params.get("code");
  if (!code) return { kind: "error", message: "Google returned no authorization code." };
  return { kind: "code", code };
}

export type OAuthError = { error: string | null; description: string | null };

/** The `error` and `error_description` of an OAuth token-endpoint error body. */
export function readOAuthError(payload: unknown): OAuthError {
  if (typeof payload !== "object" || payload === null) return { error: null, description: null };
  const record = payload as Record<string, unknown>;
  return {
    error: typeof record.error === "string" ? record.error : null,
    description: typeof record.error_description === "string" ? record.error_description : null,
  };
}
