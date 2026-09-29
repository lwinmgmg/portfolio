import type { ConnectFailure } from "@/server/email/gmail-oauth";

const FAILURES: Record<ConnectFailure, string> = {
  unconfigured: "Set the email variables in .env.local first, then restart the server.",
  failed: "Gmail could not be connected. The server log has the details.",
  state: "The sign-in expired or came from another tab. Connect again.",
  denied: "Google sign-in was cancelled. Nothing changed.",
  no_code: "Google returned no authorization code. Connect again.",
  exchange:
    "Google refused the sign-in. Check the client id and secret, and that the redirect URI below is registered on the OAuth client.",
  scope: "Google did not grant permission to send email. Connect again and tick the Gmail permission.",
  no_refresh_token:
    "Google returned no refresh token. Remove the app at myaccount.google.com/permissions, then connect again.",
};

export type ConnectBanner = { status: "saved" | "error"; message: string };

/** The result the callback route put in the page URL, or null. */
export function connectBanner(params: {
  connected?: string | string[];
  error?: string | string[];
}): ConnectBanner | null {
  if (params.connected === "1") return { status: "saved", message: "Gmail connected." };
  const error = params.error;
  if (typeof error === "string" && Object.hasOwn(FAILURES, error)) {
    return { status: "error", message: FAILURES[error as ConnectFailure] };
  }
  return null;
}

/** The callback URI to register on the Google OAuth client for the origin the admin is using. */
export function callbackUri(host: string | null, forwardedProto: string | null, path: string): string | null {
  if (!host) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = forwardedProto?.split(",")[0]?.trim() || (local ? "http" : "https");
  return `${proto}://${host}${path}`;
}
