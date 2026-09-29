import { randomBytes } from "node:crypto";

import {
  EmailSendError,
  type ContactOutbox,
  type EmailSender,
  type GmailConnection,
  type GmailConnectionRepository,
} from "@/server/domain/email";
import type { EmailEnv } from "@/server/email/email-env";
import type { GmailCredentials } from "@/server/email/gmail-email-sender";
import {
  buildConsentUrl,
  createOAuthState,
  createPkcePair,
  encodeConnectCookie,
  readConnectCookie,
  readConsentCallback,
  type ConnectFailure,
} from "@/server/email/gmail-oauth";
import type { GoogleOAuthClient } from "@/server/email/google-oauth-client";

type Log = (message: string, error?: unknown) => void;

export type GmailOAuth = Pick<GoogleOAuthClient, "exchangeCode" | "revoke">;

export type EmailServiceDeps = {
  /** Null when the email env is missing or invalid; `missing` then names the variables. */
  env: EmailEnv | null;
  missing: readonly string[];
  /** Built from the env's OAuth client; null exactly when `env` is. */
  oauth: GmailOAuth | null;
  connections: GmailConnectionRepository;
  createSender: (credentials: GmailCredentials) => EmailSender;
  now?: () => Date;
  random?: (size: number) => Buffer;
  log?: Log;
};

/** What the admin page may show. Never the refresh token. */
export type ConnectedAccount = Pick<GmailConnection, "email" | "scopes" | "connectedAt">;

export type EmailStatus =
  | { kind: "unconfigured"; missing: string[] }
  | {
      kind: "configured";
      to: string;
      dailyLimit: number;
      sessionLimit: number;
      account: ConnectedAccount | null;
    };

export type ConnectStart = { consentUrl: string; cookie: string };

export type ConnectResult =
  | { ok: true; account: ConnectedAccount }
  | { ok: false; reason: ConnectFailure };

export type DisconnectResult = { removed: boolean; revoked: boolean };

export type TestEmailResult = { ok: true; to: string } | { ok: false; message: string };

const TEST_SUBJECT = "Portfolio chat: test email";

/** The owner's Gmail connection: the admin connect flow, disconnect, test email and the sender. */
export class EmailService {
  private readonly now: () => Date;
  private readonly random: (size: number) => Buffer;
  private readonly log: Log;
  // Kept per refresh token so the sender's access-token cache survives between sends.
  private cachedSender: { refreshToken: string; sender: EmailSender } | null = null;

  constructor(private readonly deps: EmailServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random ?? randomBytes;
    this.log = deps.log ?? ((message, error) => console.error(message, error));
  }

  async status(): Promise<EmailStatus> {
    const { env, missing } = this.deps;
    if (!env) return { kind: "unconfigured", missing: [...missing] };
    const connection = await this.deps.connections.find();
    return {
      kind: "configured",
      to: env.CONTACT_EMAIL_TO,
      dailyLimit: env.CONTACT_EMAIL_DAILY_LIMIT,
      sessionLimit: env.CONTACT_EMAIL_SESSION_LIMIT,
      account: connection ? accountOf(connection) : null,
    };
  }

  /** Whether a draft could be sent: the env is set and Gmail is connected. */
  async isReady(): Promise<boolean> {
    return this.deps.env !== null && (await this.deps.connections.find()) !== null;
  }

  /** The consent URL and the cookie value that must come back with the callback. Null without env. */
  startConnect(redirectUri: string): ConnectStart | null {
    const { env } = this.deps;
    if (!env) return null;
    const pkce = createPkcePair(this.random);
    const state = createOAuthState(this.random);
    return {
      consentUrl: buildConsentUrl({
        clientId: env.GMAIL_CLIENT_ID,
        redirectUri,
        challenge: pkce.challenge,
        state,
      }),
      cookie: encodeConnectCookie({ state, verifier: pkce.verifier }),
    };
  }

  async finishConnect(options: {
    callbackUrl: URL;
    cookie: string | undefined;
    redirectUri: string;
  }): Promise<ConnectResult> {
    const { oauth } = this.deps;
    if (!oauth) return { ok: false, reason: "unconfigured" };
    const started = readConnectCookie(options.cookie);
    if (!started) return { ok: false, reason: "state" };
    const callback = readConsentCallback(options.callbackUrl, started.state);
    if (callback.kind === "error") return { ok: false, reason: callback.reason };

    const exchange = await oauth.exchangeCode({
      code: callback.code,
      redirectUri: options.redirectUri,
      verifier: started.verifier,
    });
    if (exchange.kind === "error") {
      if (exchange.detail) this.log("Gmail code exchange failed.", exchange.detail);
      return { ok: false, reason: exchange.reason };
    }
    // The earlier token is not revoked: revoking a token ends the whole grant for this client
    // and account, which would take the new token with it.
    const connection: GmailConnection = {
      ...exchange.grant,
      connectedAt: this.now().toISOString(),
    };
    await this.deps.connections.save(connection);
    this.cachedSender = null;
    return { ok: true, account: accountOf(connection) };
  }

  async disconnect(): Promise<DisconnectResult> {
    const connection = await this.deps.connections.find();
    if (!connection) return { removed: false, revoked: false };
    const revoked = this.deps.oauth ? await this.deps.oauth.revoke(connection.refreshToken) : false;
    await this.deps.connections.remove();
    this.cachedSender = null;
    return { removed: true, revoked };
  }

  /** The sender for the connected account, or null when email is not ready. */
  async sender(): Promise<EmailSender | null> {
    const { env } = this.deps;
    if (!env) return null;
    const connection = await this.deps.connections.find();
    if (!connection) return null;
    if (this.cachedSender?.refreshToken !== connection.refreshToken) {
      const sender = this.deps.createSender({
        clientId: env.GMAIL_CLIENT_ID,
        clientSecret: env.GMAIL_CLIENT_SECRET,
        refreshToken: connection.refreshToken,
      });
      this.cachedSender = { refreshToken: connection.refreshToken, sender };
    }
    return this.cachedSender.sender;
  }

  /** The sender with the recipient and limits, for the chat's Send. Null when email is not ready. */
  async outbox(): Promise<ContactOutbox | null> {
    const { env } = this.deps;
    if (!env) return null;
    const sender = await this.sender();
    if (!sender) return null;
    return {
      sender,
      to: env.CONTACT_EMAIL_TO,
      sessionLimit: env.CONTACT_EMAIL_SESSION_LIMIT,
      dailyLimit: env.CONTACT_EMAIL_DAILY_LIMIT,
    };
  }

  async sendTest(): Promise<TestEmailResult> {
    const { env } = this.deps;
    if (!env) return { ok: false, message: "Email is not configured." };
    const sender = await this.sender();
    if (!sender) return { ok: false, message: "Connect Gmail first." };
    try {
      await sender.send({
        to: env.CONTACT_EMAIL_TO,
        subject: TEST_SUBJECT,
        text:
          "This is a test email from the portfolio admin's Email page.\n\n" +
          "If it arrived, the chat can send visitor messages to this address.\n\n" +
          `Sent at ${this.now().toISOString()}`,
      });
      return { ok: true, to: env.CONTACT_EMAIL_TO };
    } catch (error) {
      // EmailSendError messages are written for the owner and hold no secrets.
      if (error instanceof EmailSendError) return { ok: false, message: error.message };
      this.log("Test email failed.", error);
      return { ok: false, message: "The test email could not be sent." };
    }
  }
}

function accountOf(connection: GmailConnection): ConnectedAccount {
  return { email: connection.email, scopes: connection.scopes, connectedAt: connection.connectedAt };
}
