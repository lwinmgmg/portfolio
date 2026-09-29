import { createHash } from "node:crypto";
import { expect, test } from "bun:test";

import {
  buildConsentUrl,
  createOAuthState,
  createPkcePair,
  readConsentCallback,
  readOAuthError,
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

test("buildConsentUrl asks for gmail.send only, offline, with PKCE and state", () => {
  const url = new URL(
    buildConsentUrl({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1:53682",
      challenge: "challenge",
      state: "state-1",
    }),
  );
  expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    client_id: "client-id",
    redirect_uri: "http://127.0.0.1:53682",
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    code_challenge: "challenge",
    code_challenge_method: "S256",
    state: "state-1",
  });
});

test("readConsentCallback returns the code when the state matches", () => {
  const url = new URL("http://127.0.0.1:1/?state=s1&code=4%2Fabc&scope=x");
  expect(readConsentCallback(url, "s1")).toEqual({ kind: "code", code: "4/abc" });
});

test("readConsentCallback rejects a missing or different state before anything else", () => {
  for (const query of ["?code=abc", "?state=other&code=abc", "?state=other&error=access_denied"]) {
    const result = readConsentCallback(new URL(`http://127.0.0.1:1/${query}`), "s1");
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).toContain("state");
  }
});

test("readConsentCallback reports a refusal and a missing code", () => {
  expect(readConsentCallback(new URL("http://127.0.0.1:1/?state=s1&error=access_denied"), "s1")).toEqual({
    kind: "error",
    message: 'Google returned "access_denied".',
  });
  expect(readConsentCallback(new URL("http://127.0.0.1:1/?state=s1"), "s1")).toEqual({
    kind: "error",
    message: "Google returned no authorization code.",
  });
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
