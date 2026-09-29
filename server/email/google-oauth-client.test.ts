import { expect, test } from "bun:test";

import type { GmailFetch } from "@/server/email/gmail-email-sender";
import { GoogleOAuthClient } from "@/server/email/google-oauth-client";

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

type Call = { url: string; form: Record<string, string> };

function client(reply: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch: GmailFetch = async (input, init = {}) => {
    calls.push({
      url: String(input),
      form: Object.fromEntries(new URLSearchParams(String(init.body))),
    });
    return reply();
  };
  return { oauth: new GoogleOAuthClient({ clientId: "id", clientSecret: "secret" }, { fetch }), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("exchangeCode posts the code with PKCE and the redirect URI, and reads the grant", async () => {
  const { oauth, calls } = client(() =>
    json({ access_token: "a", refresh_token: "1//r", scope: `openid ${SEND_SCOPE}` }),
  );
  const result = await oauth.exchangeCode({
    code: "4/code",
    redirectUri: "http://localhost:3000/api/admin/email/callback",
    verifier: "verifier",
  });
  expect(result).toEqual({
    kind: "grant",
    grant: { refreshToken: "1//r", scopes: ["openid", SEND_SCOPE], email: null },
  });
  expect(calls).toEqual([
    {
      url: "https://oauth2.googleapis.com/token",
      form: {
        grant_type: "authorization_code",
        code: "4/code",
        client_id: "id",
        client_secret: "secret",
        redirect_uri: "http://localhost:3000/api/admin/email/callback",
        code_verifier: "verifier",
      },
    },
  ]);
});

test("exchangeCode reports a refused exchange with its detail for the log", async () => {
  const { oauth } = client(() =>
    json({ error: "redirect_uri_mismatch", error_description: "Bad Request" }, 400),
  );
  expect(await oauth.exchangeCode({ code: "c", redirectUri: "r", verifier: "v" })).toEqual({
    kind: "error",
    reason: "exchange",
    detail: "400 redirect_uri_mismatch: Bad Request",
  });
});

test("exchangeCode reports a network failure and a grant without gmail.send", async () => {
  const failing = client(() => {
    throw new Error("socket hang up");
  });
  expect(await failing.oauth.exchangeCode({ code: "c", redirectUri: "r", verifier: "v" })).toEqual({
    kind: "error",
    reason: "exchange",
    detail: "socket hang up",
  });
  const narrow = client(() => json({ refresh_token: "r", scope: "openid email" }));
  expect(await narrow.oauth.exchangeCode({ code: "c", redirectUri: "r", verifier: "v" })).toEqual({
    kind: "error",
    reason: "scope",
    detail: null,
  });
});

test("revoke posts the token and treats an already invalid token as revoked", async () => {
  const { oauth, calls } = client(() => new Response(null, { status: 200 }));
  expect(await oauth.revoke("1//r")).toBe(true);
  expect(calls).toEqual([{ url: "https://oauth2.googleapis.com/revoke", form: { token: "1//r" } }]);

  expect(await client(() => json({ error: "invalid_token" }, 400)).oauth.revoke("r")).toBe(true);
  expect(await client(() => new Response(null, { status: 503 })).oauth.revoke("r")).toBe(false);
  const down = client(() => {
    throw new Error("offline");
  });
  expect(await down.oauth.revoke("r")).toBe(false);
});
