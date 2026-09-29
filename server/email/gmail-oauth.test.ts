import { createHash } from "node:crypto";
import { expect, test } from "bun:test";

import {
  buildConsentUrl,
  createOAuthState,
  createPkcePair,
  encodeConnectCookie,
  readConnectCookie,
  readConsentCallback,
  readOAuthError,
  readTokenGrant,
} from "@/server/email/gmail-oauth";

test("createPkcePair makes a 43-character verifier and its S256 challenge", () => {
  const { verifier, challenge } = createPkcePair();
  expect(/^[A-Za-z0-9_-]{43}$/.test(verifier)).toBe(true);
  expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  expect(createPkcePair().verifier).not.toBe(verifier);
});

test("createPkcePair matches the RFC 7636 appendix B example", () => {
  const bytes = Buffer.from([
    116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77,
    105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
  ]);
  expect(createPkcePair(() => bytes)).toEqual({
    verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  });
});

test("createOAuthState is random base64url", () => {
  expect(/^[A-Za-z0-9_-]{22}$/.test(createOAuthState())).toBe(true);
  expect(createOAuthState()).not.toBe(createOAuthState());
});

test("buildConsentUrl asks for gmail.send plus the address, offline, with PKCE and state", () => {
  const url = new URL(
    buildConsentUrl({
      clientId: "client-id",
      redirectUri: "http://localhost:3000/api/admin/email/callback",
      challenge: "challenge",
      state: "state-1",
    }),
  );
  expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: "client-id",
    redirect_uri: "http://localhost:3000/api/admin/email/callback",
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    code_challenge: "challenge",
    code_challenge_method: "S256",
    state: "state-1",
  });
});

test("the connect cookie round-trips and rejects anything else", () => {
  const value = { state: createOAuthState(), verifier: createPkcePair().verifier };
  expect(readConnectCookie(encodeConnectCookie(value))).toEqual(value);
  for (const bad of [undefined, "", "state", "a.b.c", ".verifier", "state.", "st ate.verifier", "a.b=c"]) {
    expect(readConnectCookie(bad)).toBeNull();
  }
});

test("readConsentCallback returns the code when the state matches", () => {
  const url = new URL("http://localhost:3000/cb?state=s1&code=4%2Fabc&scope=x");
  expect(readConsentCallback(url, "s1")).toEqual({ kind: "code", code: "4/abc" });
});

test("readConsentCallback rejects a missing or different state before anything else", () => {
  for (const query of ["?code=abc", "?state=other&code=abc", "?state=other&error=access_denied"]) {
    expect(readConsentCallback(new URL(`http://localhost:3000/cb${query}`), "s1")).toEqual({
      kind: "error",
      reason: "state",
    });
  }
});

test("readConsentCallback reports a refusal and a missing code", () => {
  expect(readConsentCallback(new URL("http://localhost:3000/cb?state=s1&error=access_denied"), "s1")).toEqual({
    kind: "error",
    reason: "denied",
  });
  expect(readConsentCallback(new URL("http://localhost:3000/cb?state=s1"), "s1")).toEqual({
    kind: "error",
    reason: "no_code",
  });
});

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.signature`;
}

const SCOPES = "openid https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

test("readTokenGrant keeps the refresh token, the scopes and the address from the ID token", () => {
  expect(
    readTokenGrant({
      access_token: "access",
      refresh_token: "1//refresh",
      scope: SCOPES,
      id_token: idToken({ email: "owner@gmail.com", email_verified: true }),
    }),
  ).toEqual({
    kind: "grant",
    grant: {
      refreshToken: "1//refresh",
      scopes: SCOPES.split(" "),
      email: "owner@gmail.com",
    },
  });
});

test("readTokenGrant still connects without a readable address", () => {
  for (const id_token of [undefined, "not-a-jwt", idToken({ sub: "1" })]) {
    const result = readTokenGrant({ refresh_token: "r", scope: SCOPES, id_token });
    expect(result.kind === "grant" ? result.grant.email : "error").toBeNull();
  }
});

test("readTokenGrant needs gmail.send and a refresh token", () => {
  expect(readTokenGrant({ refresh_token: "r", scope: "openid email" })).toEqual({
    kind: "error",
    reason: "scope",
  });
  expect(readTokenGrant({ scope: SCOPES })).toEqual({ kind: "error", reason: "no_refresh_token" });
  expect(readTokenGrant(null)).toEqual({ kind: "error", reason: "scope" });
});

test("readOAuthError reads the error fields and ignores anything else", () => {
  expect(readOAuthError({ error: "invalid_grant", error_description: "Bad Request" })).toEqual({
    error: "invalid_grant",
    description: "Bad Request",
  });
  expect(readOAuthError({ error: { code: 1 } })).toEqual({ error: null, description: null });
  expect(readOAuthError(null)).toEqual({ error: null, description: null });
  expect(readOAuthError("oops")).toEqual({ error: null, description: null });
});
