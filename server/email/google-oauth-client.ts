import type { GmailFetch } from "@/server/email/gmail-email-sender";
import {
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  readOAuthError,
  readTokenGrant,
  type ConnectFailure,
  type TokenGrant,
} from "@/server/email/gmail-oauth";

const DEFAULT_TIMEOUT_MS = 15_000;

export type OAuthClientCredentials = { clientId: string; clientSecret: string };

export type CodeExchange =
  | { kind: "grant"; grant: TokenGrant }
  // `detail` is for the server log only.
  | { kind: "error"; reason: ConnectFailure; detail: string | null };

/** The two Google OAuth calls the admin connect flow makes: code exchange and revocation. */
export class GoogleOAuthClient {
  private readonly fetchImpl: GmailFetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly credentials: OAuthClientCredentials,
    options: { fetch?: GmailFetch; timeoutMs?: number } = {},
  ) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async exchangeCode(options: {
    code: string;
    redirectUri: string;
    verifier: string;
  }): Promise<CodeExchange> {
    let response: Response;
    try {
      response = await this.post(GOOGLE_TOKEN_URL, {
        grant_type: "authorization_code",
        code: options.code,
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        redirect_uri: options.redirectUri,
        code_verifier: options.verifier,
      });
    } catch (error) {
      return { kind: "error", reason: "exchange", detail: errorMessage(error) };
    }
    const payload = await readJsonOrNull(response);
    if (!response.ok) {
      const { error, description } = readOAuthError(payload);
      const detail = `${response.status}${error ? ` ${error}` : ""}${description ? `: ${description}` : ""}`;
      return { kind: "error", reason: "exchange", detail };
    }
    const read = readTokenGrant(payload);
    return read.kind === "grant" ? read : { ...read, detail: null };
  }

  /** Best effort: true when Google confirmed the token is revoked (or was already invalid). */
  async revoke(token: string): Promise<boolean> {
    try {
      const response = await this.post(GOOGLE_REVOKE_URL, { token });
      await response.body?.cancel();
      // Google answers 400 invalid_token for a token that is already revoked or expired.
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  private post(url: string, form: Record<string, string>): Promise<Response> {
    return this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
