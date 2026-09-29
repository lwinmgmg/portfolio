import { expect, test } from "bun:test";

import {
  EmailSendError,
  type EmailSender,
  type GmailConnection,
  type GmailConnectionRepository,
  type OutgoingEmail,
} from "@/server/domain/email";
import type { EmailEnv } from "@/server/email/email-env";
import type { GmailCredentials } from "@/server/email/gmail-email-sender";
import type { CodeExchange } from "@/server/email/google-oauth-client";
import { EmailService, type GmailOAuth } from "@/server/services/email-service";

const env: EmailEnv = {
  GMAIL_CLIENT_ID: "client-id",
  GMAIL_CLIENT_SECRET: "client-secret",
  CONTACT_EMAIL_TO: "owner@example.com",
  CONTACT_EMAIL_DAILY_LIMIT: 20,
  CONTACT_EMAIL_SESSION_LIMIT: 2,
};
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REDIRECT = "http://localhost:3000/api/admin/email/callback";
const now = new Date("2026-09-29T12:00:00.000Z");

const stored: GmailConnection = {
  email: "owner@gmail.com",
  refreshToken: "1//old",
  scopes: ["openid", SEND_SCOPE],
  connectedAt: "2026-09-01T00:00:00.000Z",
};

class MemoryConnections implements GmailConnectionRepository {
  constructor(public connection: GmailConnection | null = null) {}

  async find() {
    return this.connection;
  }

  async save(connection: GmailConnection) {
    this.connection = connection;
  }

  async remove() {
    this.connection = null;
  }
}

class FakeOAuth implements GmailOAuth {
  exchanges: Parameters<GmailOAuth["exchangeCode"]>[0][] = [];
  revoked: string[] = [];

  constructor(
    private readonly exchange: CodeExchange = {
      kind: "grant",
      grant: { refreshToken: "1//new", scopes: ["openid", SEND_SCOPE], email: "owner@gmail.com" },
    },
    private readonly revokes = true,
  ) {}

  async exchangeCode(options: Parameters<GmailOAuth["exchangeCode"]>[0]) {
    this.exchanges.push(options);
    return this.exchange;
  }

  async revoke(token: string) {
    this.revoked.push(token);
    return this.revokes;
  }
}

class FakeSender implements EmailSender {
  sent: OutgoingEmail[] = [];

  constructor(private readonly failure: unknown = null) {}

  async send(email: OutgoingEmail) {
    if (this.failure) throw this.failure;
    this.sent.push(email);
    return { messageId: "msg-1" };
  }
}

function setup(
  options: {
    configured?: boolean;
    connection?: GmailConnection | null;
    oauth?: FakeOAuth;
    senderFailure?: unknown;
  } = {},
) {
  const configured = options.configured ?? true;
  const connections = new MemoryConnections(options.connection ?? null);
  const oauth = options.oauth ?? new FakeOAuth();
  const senders: { credentials: GmailCredentials; sender: FakeSender }[] = [];
  const logs: unknown[][] = [];
  let byte = 0;
  const service = new EmailService({
    env: configured ? env : null,
    missing: configured ? [] : ["GMAIL_CLIENT_ID", "CONTACT_EMAIL_TO"],
    oauth: configured ? oauth : null,
    connections,
    createSender: (credentials) => {
      const sender = new FakeSender(options.senderFailure);
      senders.push({ credentials, sender });
      return sender;
    },
    now: () => now,
    random: (size) => Buffer.alloc(size, ++byte),
    log: (...args) => logs.push(args),
  });
  return { service, connections, oauth, senders, logs };
}

async function started(service: EmailService) {
  const start = service.startConnect(REDIRECT);
  if (!start) throw new Error("Expected a connect start.");
  const state = new URL(start.consentUrl).searchParams.get("state") ?? "";
  return { ...start, state };
}

function callback(query: Record<string, string>): URL {
  const url = new URL(REDIRECT);
  url.search = new URLSearchParams(query).toString();
  return url;
}

test("status names the missing variables, or shows the connection without its token", async () => {
  expect(await setup({ configured: false }).service.status()).toEqual({
    kind: "unconfigured",
    missing: ["GMAIL_CLIENT_ID", "CONTACT_EMAIL_TO"],
  });
  expect(await setup().service.status()).toEqual({
    kind: "configured",
    to: "owner@example.com",
    dailyLimit: 20,
    sessionLimit: 2,
    account: null,
  });
  const status = await setup({ connection: stored }).service.status();
  expect(status).toEqual({
    kind: "configured",
    to: "owner@example.com",
    dailyLimit: 20,
    sessionLimit: 2,
    account: { email: "owner@gmail.com", scopes: stored.scopes, connectedAt: stored.connectedAt },
  });
  expect(JSON.stringify(status)).not.toContain("1//old");
});

test("isReady needs both the env and a connection", async () => {
  expect(await setup({ configured: false, connection: stored }).service.isReady()).toBe(false);
  expect(await setup().service.isReady()).toBe(false);
  expect(await setup({ connection: stored }).service.isReady()).toBe(true);
});

test("startConnect builds the consent URL and a cookie holding its state and verifier", async () => {
  const { service } = setup();
  const start = await started(service);
  const url = new URL(start.consentUrl);
  expect(url.searchParams.get("client_id")).toBe("client-id");
  expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
  expect(start.cookie.startsWith(`${start.state}.`)).toBe(true);
  expect(setup({ configured: false }).service.startConnect(REDIRECT)).toBeNull();
});

test("finishConnect exchanges the code with the cookie's verifier and saves the connection", async () => {
  const { service, connections, oauth } = setup({ connection: stored });
  const start = await started(service);
  const result = await service.finishConnect({
    callbackUrl: callback({ state: start.state, code: "4/code" }),
    cookie: start.cookie,
    redirectUri: REDIRECT,
  });

  expect(result).toEqual({
    ok: true,
    account: { email: "owner@gmail.com", scopes: ["openid", SEND_SCOPE], connectedAt: now.toISOString() },
  });
  expect(oauth.exchanges).toEqual([
    { code: "4/code", redirectUri: REDIRECT, verifier: start.cookie.split(".")[1] ?? "" },
  ]);
  expect(connections.connection).toEqual({
    email: "owner@gmail.com",
    refreshToken: "1//new",
    scopes: ["openid", SEND_SCOPE],
    connectedAt: now.toISOString(),
  });
  // Revoking the old token would end the grant the new token belongs to.
  expect(oauth.revoked).toEqual([]);
});

test("finishConnect stops on a missing cookie, another state, a refusal or no code", async () => {
  const { service, oauth, connections } = setup();
  const start = await started(service);
  const finish = (cookie: string | undefined, query: Record<string, string>) =>
    service.finishConnect({ callbackUrl: callback(query), cookie, redirectUri: REDIRECT });

  expect(await finish(undefined, { state: start.state, code: "c" })).toEqual({ ok: false, reason: "state" });
  expect(await finish(start.cookie, { state: "other", code: "c" })).toEqual({ ok: false, reason: "state" });
  expect(await finish(start.cookie, { state: start.state, error: "access_denied" })).toEqual({
    ok: false,
    reason: "denied",
  });
  expect(await finish(start.cookie, { state: start.state })).toEqual({ ok: false, reason: "no_code" });
  expect(oauth.exchanges).toEqual([]);
  expect(connections.connection).toBeNull();
});

test("finishConnect logs a refused exchange and keeps the old connection", async () => {
  const oauth = new FakeOAuth({ kind: "error", reason: "exchange", detail: "400 invalid_grant" });
  const { service, connections, logs } = setup({ connection: stored, oauth });
  const start = await started(service);
  expect(
    await service.finishConnect({
      callbackUrl: callback({ state: start.state, code: "c" }),
      cookie: start.cookie,
      redirectUri: REDIRECT,
    }),
  ).toEqual({ ok: false, reason: "exchange" });
  expect(logs).toEqual([["Gmail code exchange failed.", "400 invalid_grant"]]);
  expect(connections.connection).toEqual(stored);
});

test("finishConnect without env reports unconfigured", async () => {
  const { service } = setup({ configured: false });
  expect(
    await service.finishConnect({ callbackUrl: callback({}), cookie: "a.b", redirectUri: REDIRECT }),
  ).toEqual({ ok: false, reason: "unconfigured" });
});

test("disconnect revokes the token and removes the connection", async () => {
  const { service, connections, oauth } = setup({ connection: stored });
  expect(await service.disconnect()).toEqual({ removed: true, revoked: true });
  expect(oauth.revoked).toEqual(["1//old"]);
  expect(connections.connection).toBeNull();
  expect(await service.disconnect()).toEqual({ removed: false, revoked: false });
});

test("disconnect still removes the connection when Google does not confirm the revocation", async () => {
  const { service, connections } = setup({ connection: stored, oauth: new FakeOAuth(undefined, false) });
  expect(await service.disconnect()).toEqual({ removed: true, revoked: false });
  expect(connections.connection).toBeNull();
});

test("sender uses the env client and the stored token, and is rebuilt after a reconnect", async () => {
  const { service, senders, connections } = setup({ connection: stored });
  const first = await service.sender();
  expect(await service.sender()).toBe(first);
  expect(senders.map((entry) => entry.credentials)).toEqual([
    { clientId: "client-id", clientSecret: "client-secret", refreshToken: "1//old" },
  ]);

  await connections.save({ ...stored, refreshToken: "1//new" });
  expect(await service.sender()).not.toBe(first);
  expect(senders.at(-1)?.credentials.refreshToken).toBe("1//new");
  expect(await setup().service.sender()).toBeNull();
});

test("outbox gives the chat's Send the cached sender, the recipient and the limits", async () => {
  const { service } = setup({ connection: stored });
  const outbox = await service.outbox();
  expect(outbox?.sender === (await service.sender())).toBe(true);
  expect({ ...outbox, sender: null }).toEqual({
    sender: null,
    to: "owner@example.com",
    sessionLimit: 2,
    dailyLimit: 20,
  });
  expect(await setup().service.outbox()).toBeNull();
  expect(await setup({ configured: false, connection: stored }).service.outbox()).toBeNull();
});

test("sendTest mails CONTACT_EMAIL_TO through the connected account", async () => {
  const { service, senders } = setup({ connection: stored });
  expect(await service.sendTest()).toEqual({ ok: true, to: "owner@example.com" });
  const [email] = senders[0]?.sender.sent ?? [];
  expect(email?.to).toBe("owner@example.com");
  expect(email?.subject).toBe("Portfolio chat: test email");
  expect(email?.text).toContain(now.toISOString());
});

test("sendTest explains what is missing or what Gmail said", async () => {
  expect(await setup({ configured: false }).service.sendTest()).toEqual({
    ok: false,
    message: "Email is not configured.",
  });
  expect(await setup().service.sendTest()).toEqual({ ok: false, message: "Connect Gmail first." });

  const refused = new EmailSendError("Gmail send failed with 403: Forbidden", { status: 403, retryable: false });
  expect(await setup({ connection: stored, senderFailure: refused }).service.sendTest()).toEqual({
    ok: false,
    message: "Gmail send failed with 403: Forbidden",
  });

  const broken = setup({ connection: stored, senderFailure: new Error("bug") });
  expect(await broken.service.sendTest()).toEqual({
    ok: false,
    message: "The test email could not be sent.",
  });
  expect(broken.logs.length).toBe(1);
});
