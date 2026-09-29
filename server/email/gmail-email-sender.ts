import {
  EmailSendError,
  type EmailSender,
  type OutgoingEmail,
  type SentEmail,
} from "@/server/domain/email";
import type { EmailEnv } from "@/server/email/email-env";
import { GOOGLE_TOKEN_URL, readOAuthError, REFRESH_TOKEN_COMMAND } from "@/server/email/gmail-oauth";
import { buildGmailRaw, MimeHeaderError } from "@/server/email/mime-message";

export const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const DEFAULT_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type GmailFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GmailCredentials = Pick<
  EmailEnv,
  "GMAIL_CLIENT_ID" | "GMAIL_CLIENT_SECRET" | "GMAIL_REFRESH_TOKEN"
>;

export type GmailEmailSenderOptions = {
  fetch?: GmailFetch;
  /** Epoch milliseconds. */
  now?: () => number;
  timeoutMs?: number;
};

type CachedToken = { value: string; refreshAt: number };

// Nothing can have been sent during a token request, so its failures may be retried. A send
// request may have reached Gmail before it failed, and Gmail has no idempotency key.
type Phase = "token" | "send";

/**
 * Sends through the Gmail API as the owner's account, with an OAuth refresh token limited to the
 * gmail.send scope. It never retries a send that may have reached Gmail.
 */
export class GmailEmailSender implements EmailSender {
  private readonly credentials: GmailCredentials;
  private readonly fetchImpl: GmailFetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private token: CachedToken | null = null;

  constructor(credentials: GmailCredentials, options: GmailEmailSenderOptions = {}) {
    this.credentials = credentials;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send(email: OutgoingEmail, signal?: AbortSignal): Promise<SentEmail> {
    const raw = encodeMessage(email);
    let response = await this.postMessage(raw, await this.accessToken(signal), signal);
    if (response.status === 401) {
      // Gmail refused the access token, so the message was not accepted. Refresh and try once more.
      await response.body?.cancel();
      this.token = null;
      response = await this.postMessage(raw, await this.accessToken(signal), signal);
    }
    const payload = await readJsonOrNull(response);
    if (!response.ok) throw sendError(response.status, payload);

    const id = messageId(payload);
    if (!id) {
      throw new EmailSendError("Gmail accepted the message but returned no message id", {
        status: response.status,
        retryable: false,
      });
    }
    return { messageId: id };
  }

  private async accessToken(signal: AbortSignal | undefined): Promise<string> {
    if (this.token && this.now() < this.token.refreshAt) return this.token.value;

    const requestedAt = this.now();
    const response = await this.request(
      "token",
      GOOGLE_TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.credentials.GMAIL_CLIENT_ID,
          client_secret: this.credentials.GMAIL_CLIENT_SECRET,
          refresh_token: this.credentials.GMAIL_REFRESH_TOKEN,
        }),
      },
      signal,
    );
    const payload = await readJsonOrNull(response);
    if (!response.ok) throw tokenError(response.status, payload);

    const record = asRecord(payload);
    const value = record?.access_token;
    if (typeof value !== "string" || value.length === 0) {
      throw new EmailSendError("Google token response has no access token", {
        status: response.status,
        retryable: false,
      });
    }
    // Without a lifetime the token is used for this send only.
    const expiresIn = typeof record?.expires_in === "number" ? record.expires_in : 0;
    this.token = { value, refreshAt: requestedAt + expiresIn * 1000 - TOKEN_REFRESH_MARGIN_MS };
    return value;
  }

  private postMessage(raw: string, accessToken: string, signal: AbortSignal | undefined) {
    return this.request(
      "send",
      GMAIL_SEND_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
      signal,
    );
  }

  private async request(
    phase: Phase,
    url: string,
    init: RequestInit,
    outer: AbortSignal | undefined,
  ): Promise<Response> {
    const retryable = phase === "token";
    const target = phase === "token" ? "Google token request" : "Gmail send request";
    if (outer?.aborted) {
      throw new EmailSendError(`${target} was aborted`, { status: null, retryable: true });
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
    try {
      return await this.fetchImpl(url, { ...init, signal });
    } catch (error) {
      const reason = outer?.aborted
        ? "was aborted"
        : timeout.aborted || isTimeout(error)
          ? `timed out after ${this.timeoutMs} ms`
          : `failed: ${error instanceof Error ? error.message : String(error)}`;
      throw new EmailSendError(`${target} ${reason}`, { status: null, retryable, cause: error });
    }
  }
}

function encodeMessage(email: OutgoingEmail): string {
  try {
    return buildGmailRaw(email);
  } catch (error) {
    if (!(error instanceof MimeHeaderError)) throw error;
    throw new EmailSendError(error.message, { status: null, retryable: false, cause: error });
  }
}

function tokenError(status: number, payload: unknown): EmailSendError {
  const { error, description } = readOAuthError(payload);
  if (error === "invalid_grant") {
    return new EmailSendError(
      `Google refused the Gmail refresh token (invalid_grant): it was revoked or has expired. ` +
        `Run \`${REFRESH_TOKEN_COMMAND}\` again and update GMAIL_REFRESH_TOKEN.`,
      { status, retryable: false },
    );
  }
  if (error === "invalid_client" || error === "unauthorized_client") {
    return new EmailSendError(
      `Google refused the OAuth client (${error}). Check GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.`,
      { status, retryable: false },
    );
  }
  const detail = description ?? error;
  return new EmailSendError(
    `Google token request failed with ${status}${detail ? `: ${detail}` : ""}`,
    { status, retryable: status === 429 || status >= 500 },
  );
}

function sendError(status: number, payload: unknown): EmailSendError {
  const detail = gmailErrorMessage(payload);
  // Only a rate limit is known to be refused before sending. A 5xx may follow a delivered message.
  return new EmailSendError(`Gmail send failed with ${status}${detail ? `: ${detail}` : ""}`, {
    status,
    retryable: status === 429,
  });
}

function gmailErrorMessage(payload: unknown): string | null {
  const error = asRecord(asRecord(payload)?.error);
  return typeof error?.message === "string" && error.message.length > 0 ? error.message : null;
}

function messageId(payload: unknown): string | null {
  const id = asRecord(payload)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
