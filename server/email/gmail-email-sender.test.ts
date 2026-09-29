import { describe, expect, test } from "bun:test";

import { EmailSendError } from "@/server/domain/email";
import { GMAIL_SEND_URL, GmailEmailSender, type GmailFetch } from "@/server/email/gmail-email-sender";
import { GOOGLE_TOKEN_URL } from "@/server/email/gmail-oauth";
import { buildMimeMessage } from "@/server/email/mime-message";

const credentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};
const email = { to: "owner@example.com", subject: "Hello", text: "Hi Lwin.\nJane" };

type Call = { url: string; init: RequestInit };
type Reply = (call: Call) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A null lifetime leaves `expires_in` out of the response.
const token = (value = "access-1", expiresIn: number | null = 3600): Reply => () =>
  json(expiresIn === null ? { access_token: value } : { access_token: value, expires_in: expiresIn });
const sent = (id = "msg-1"): Reply => () => json({ id, threadId: "thread-1", labelIds: ["SENT"] });

function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fetch: GmailFetch = async (input, init = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request to ${call.url}`);
    return reply(call);
  };
  return { fetch, calls };
}

function setup(replies: Reply[], options: { timeoutMs?: number } = {}) {
  let now = Date.UTC(2026, 8, 29, 12);
  const { fetch, calls } = fakeFetch(replies);
  const sender = new GmailEmailSender(credentials, { fetch, now: () => now, ...options });
  return {
    sender,
    calls,
    urls: () => calls.map((call) => (call.url === GOOGLE_TOKEN_URL ? "token" : "send")),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function sendError(promise: Promise<unknown>): Promise<EmailSendError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error instanceof EmailSendError).toBe(true);
  return error as EmailSendError;
}

function header(call: Call, name: string): string | null {
  return new Headers(call.init.headers).get(name);
}

describe("request shape", () => {
  test("exchanges the refresh token, then posts the raw message with the access token", async () => {
    const { sender, calls } = setup([token("access-1"), sent("msg-42")]);

    expect(await sender.send(email)).toEqual({ messageId: "msg-42" });

    const [tokenCall, sendCall] = calls;
    expect(tokenCall.url).toBe("https://oauth2.googleapis.com/token");
    expect(tokenCall.init.method).toBe("POST");
    expect(header(tokenCall, "content-type")).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(tokenCall.init.body)))).toEqual({
      grant_type: "refresh_token",
      client_id: "client-id",
      client_secret: "client-secret",
      refresh_token: "refresh-token",
    });

    expect(sendCall.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(sendCall.url).toBe(GMAIL_SEND_URL);
    expect(sendCall.init.method).toBe("POST");
    expect(header(sendCall, "authorization")).toBe("Bearer access-1");
    expect(header(sendCall, "content-type")).toBe("application/json");
    const body = JSON.parse(String(sendCall.init.body)) as { raw: string };
    expect(Object.keys(body)).toEqual(["raw"]);
    expect(Buffer.from(body.raw, "base64url").toString("utf8")).toBe(buildMimeMessage(email));
  });

  test("passes an abort signal on every request", async () => {
    const { sender, calls } = setup([token(), sent()]);
    await sender.send(email);
    expect(calls.every((call) => call.init.signal instanceof AbortSignal)).toBe(true);
  });
});

describe("access token cache", () => {
  test("reuses the access token for later sends", async () => {
    const { sender, urls } = setup([token(), sent("a"), sent("b")]);
    await sender.send(email);
    await sender.send(email);
    expect(urls()).toEqual(["token", "send", "send"]);
  });

  test("keeps the token until 60 seconds before it expires, then fetches a new one", async () => {
    const { sender, calls, urls, advance } = setup([
      token("access-1", 3600),
      sent(),
      sent(),
      token("access-2", 3600),
      sent(),
    ]);
    await sender.send(email);
    advance(3_539_000);
    await sender.send(email);
    advance(1_000);
    await sender.send(email);

    expect(urls()).toEqual(["token", "send", "send", "token", "send"]);
    expect(header(calls[4], "authorization")).toBe("Bearer access-2");
  });

  test("does not cache a token that comes without a lifetime", async () => {
    const { sender, urls } = setup([token("a", null), sent(), token("b", null), sent()]);
    await sender.send(email);
    await sender.send(email);
    expect(urls()).toEqual(["token", "send", "token", "send"]);
  });

  test("a failed token request leaves nothing cached", async () => {
    const { sender, urls } = setup([() => json({ error: "backend_error" }, 503), token(), sent()]);
    await sendError(sender.send(email));
    await sender.send(email);
    expect(urls()).toEqual(["token", "token", "send"]);
  });
});

describe("401 from Gmail", () => {
  test("clears the cached token, fetches a new one and sends once more", async () => {
    const { sender, calls, urls } = setup([
      token("stale"),
      () => json({ error: { code: 401, message: "Invalid Credentials" } }, 401),
      token("fresh"),
      sent("msg-2"),
    ]);

    expect(await sender.send(email)).toEqual({ messageId: "msg-2" });
    expect(urls()).toEqual(["token", "send", "token", "send"]);
    expect(header(calls[3], "authorization")).toBe("Bearer fresh");
    expect(calls[3].init.body).toBe(calls[1].init.body);
  });

  test("a second 401 fails without another attempt", async () => {
    const unauthorized: Reply = () =>
      json({ error: { code: 401, message: "Invalid Credentials" } }, 401);
    const { sender, urls } = setup([token(), unauthorized, token(), unauthorized]);

    const error = await sendError(sender.send(email));
    expect(error.status).toBe(401);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("Invalid Credentials");
    expect(urls()).toEqual(["token", "send", "token", "send"]);
  });
});

describe("token errors", () => {
  test("invalid_grant says to connect Gmail again on the admin page", async () => {
    const { sender, urls } = setup([
      () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400),
    ]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(400);
    expect(error.message).toContain("invalid_grant");
    expect(error.message).toContain("/admin/email");
    expect(urls()).toEqual(["token"]);
  });

  test("invalid_client points at the client id and secret", async () => {
    const { sender } = setup([() => json({ error: "invalid_client" }, 401)]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("GMAIL_CLIENT_ID");
  });

  test("a 5xx, a 429 or a network failure may be retried, since nothing was sent", async () => {
    for (const reply of [
      () => json({ error: "backend_error" }, 503),
      () => json({ error: "rate_limit" }, 429),
      () => {
        throw new TypeError("fetch failed");
      },
    ] satisfies Reply[]) {
      const { sender, urls } = setup([reply]);
      const error = await sendError(sender.send(email));
      expect(error.retryable).toBe(true);
      expect(urls()).toEqual(["token"]);
    }
  });

  test("another 4xx is final and carries Google's description", async () => {
    const { sender } = setup([
      () => json({ error: "invalid_request", error_description: "Missing parameter" }, 400),
    ]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("Google token request failed with 400: Missing parameter");
  });

  test("a success without an access token is an error", async () => {
    const { sender, urls } = setup([() => json({ expires_in: 3600 })]);
    const error = await sendError(sender.send(email));
    expect(error.message).toContain("no access token");
    expect(urls()).toEqual(["token"]);
  });
});

describe("send errors are never retried", () => {
  test("a 5xx is final and sent once", async () => {
    const { sender, urls } = setup([
      token(),
      () => json({ error: { code: 500, message: "Backend Error" } }, 500),
    ]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(500);
    expect(error.message).toBe("Gmail send failed with 500: Backend Error");
    expect(urls()).toEqual(["token", "send"]);
  });

  test("a network failure is final, since the request may have reached Gmail", async () => {
    const { sender, urls } = setup([
      token(),
      () => {
        throw new TypeError("socket hang up");
      },
    ]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("socket hang up");
    expect(urls()).toEqual(["token", "send"]);
  });

  test("a timeout is final", async () => {
    const hang: Reply = ({ init }) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const { sender, urls } = setup([token(), hang], { timeoutMs: 10 });
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("Gmail send request timed out after 10 ms");
    expect(urls()).toEqual(["token", "send"]);
  });

  test("a 429 was refused before sending, so it may be retried later", async () => {
    const { sender } = setup([
      token(),
      () => json({ error: { code: 429, message: "User-rate limit exceeded" } }, 429),
    ]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(429);
  });

  test("a 4xx without a Gmail error body still names the status", async () => {
    const { sender } = setup([token(), () => new Response("nope", { status: 400 })]);
    const error = await sendError(sender.send(email));
    expect(error.message).toBe("Gmail send failed with 400");
    expect(error.retryable).toBe(false);
  });

  test("a success without a message id is final", async () => {
    const { sender } = setup([token(), () => json({ threadId: "t" })]);
    const error = await sendError(sender.send(email));
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("no message id");
  });
});

describe("before any request", () => {
  test("a header-injection attempt fails without touching the network", async () => {
    const { sender, calls } = setup([]);
    const error = await sendError(
      sender.send({ ...email, subject: "Hi\r\nBcc: attacker@example.com" }),
    );
    expect(error.retryable).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("an aborted signal stops the send before Gmail is called", async () => {
    const { sender, calls } = setup([token(), sent()]);
    const controller = new AbortController();
    controller.abort();
    const error = await sendError(sender.send(email, controller.signal));
    expect(error.message).toContain("aborted");
    expect(calls).toHaveLength(0);
  });
});
