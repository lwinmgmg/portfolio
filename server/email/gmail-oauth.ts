import { createHash, randomBytes } from "node:crypto";

import { decodeJwt } from "jose";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
// openid and email only name the connected address on the admin page; sending needs gmail.send.
export const CONNECT_SCOPES = ["openid", "email", GMAIL_SEND_SCOPE] as const;
/** The admin page that connects Gmail. */
export const EMAIL_ADMIN_PATH = "/admin/email";
export const GMAIL_CONNECT_PATH = "/api/admin/email/connect";
/** Where Google sends the owner back. Register `<origin>` + this path on the OAuth client. */
export const GMAIL_CALLBACK_PATH = "/api/admin/email/callback";
/** Holds the state and PKCE verifier between the connect redirect and the callback. */
export const GMAIL_CONNECT_COOKIE = "gmail_connect";
export const GMAIL_CONNECT_COOKIE_PATH = "/api/admin/email";
export const GMAIL_CONNECT_SECONDS = 10 * 60;
/** How the owner gets a new refresh token; named in errors that need one. */
export const RECONNECT_HINT = `Connect Gmail again on the admin Email page (${EMAIL_ADMIN_PATH}).`;

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
    scope: CONNECT_SCOPES.join(" "),
    // offline + consent: Google returns a refresh token even if this account consented before.
    access_type: "offline",
    prompt: "consent",
    code_challenge: options.challenge,
    code_challenge_method: "S256",
    state: options.state,
  }).toString();
  return url.toString();
}

export type ConnectCookie = { state: string; verifier: string };

// Both parts are base64url, so a dot cannot occur inside either.
export function encodeConnectCookie(value: ConnectCookie): string {
  return `${value.state}.${value.verifier}`;
}

export function readConnectCookie(value: string | undefined): ConnectCookie | null {
  const [state, verifier, ...rest] = (value ?? "").split(".");
  const part = /^[A-Za-z0-9_-]+$/;
  if (rest.length > 0 || !state || !verifier || !part.test(state) || !part.test(verifier)) {
    return null;
  }
  return { state, verifier };
}

/** Why a connect attempt stopped. The admin page words each one. */
export type ConnectFailure =
  | "unconfigured"
  | "failed"
  | "state"
  | "denied"
  | "no_code"
  | "exchange"
  | "scope"
  | "no_refresh_token";

export type ConsentCallback =
  | { kind: "code"; code: string }
  | { kind: "error"; reason: ConnectFailure };

/** Reads Google's redirect back to the callback route. */
export function readConsentCallback(url: URL, expectedState: string): ConsentCallback {
  const params = url.searchParams;
  if (params.get("state") !== expectedState) return { kind: "error", reason: "state" };
  if (params.get("error")) return { kind: "error", reason: "denied" };
  const code = params.get("code");
  if (!code) return { kind: "error", reason: "no_code" };
  return { kind: "code", code };
}

export type TokenGrant = { refreshToken: string; scopes: string[]; email: string | null };

/** Checks a successful authorization-code response: gmail.send granted and a refresh token. */
export function readTokenGrant(
  payload: unknown,
): { kind: "grant"; grant: TokenGrant } | { kind: "error"; reason: ConnectFailure } {
  const record = asRecord(payload) ?? {};
  const scopes = typeof record.scope === "string" ? record.scope.split(" ").filter(Boolean) : [];
  if (!scopes.includes(GMAIL_SEND_SCOPE)) return { kind: "error", reason: "scope" };
  const refreshToken = record.refresh_token;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return { kind: "error", reason: "no_refresh_token" };
  }
  const email = typeof record.id_token === "string" ? idTokenEmail(record.id_token) : null;
  return { kind: "grant", grant: { refreshToken, scopes, email } };
}

// The ID token came straight from Google's token endpoint over TLS, so its signature need not be
// checked (OpenID Connect Core 3.1.3.7). It only labels the account on the admin page.
function idTokenEmail(idToken: string): string | null {
  try {
    const { email } = decodeJwt(idToken);
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

export type OAuthError = { error: string | null; description: string | null };

/** The `error` and `error_description` of an OAuth token-endpoint error body. */
export function readOAuthError(payload: unknown): OAuthError {
  const record = asRecord(payload);
  if (!record) return { error: null, description: null };
  return {
    error: typeof record.error === "string" ? record.error : null,
    description: typeof record.error_description === "string" ? record.error_description : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
