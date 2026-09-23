import { expect, test } from "bun:test";
import { SignJWT } from "jose";

import { JoseTokenSigner } from "@/server/auth/token-signer";
import {
  ADMIN_SUBJECT,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "@/server/domain/auth";

const SECRET = "test-secret-that-is-at-least-32-chars";
const signer = new JoseTokenSigner(SECRET);
const key = new TextEncoder().encode(SECRET);

function futureExpiry(): number {
  return Math.floor(Date.now() / 1000) + 60;
}

test("round-trips an admin session", async () => {
  const expiresAt = futureExpiry();
  const token = await signer.sign({ subject: "admin", expiresAt });
  const session = await signer.verify(token);

  expect(session).toEqual({ subject: "admin", expiresAt });
});

test("rejects an expired token", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ADMIN_SUBJECT)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 60)
    .sign(key);

  expect(await signer.verify(token)).toBeNull();
});

test("rejects a token for a different subject", async () => {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("guest")
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(futureExpiry())
    .sign(key);

  expect(await signer.verify(token)).toBeNull();
});

test("rejects a token signed with a different secret", async () => {
  const other = new JoseTokenSigner(`${SECRET}-other-value`);
  const token = await signer.sign({ subject: "admin", expiresAt: futureExpiry() });

  expect(await other.verify(token)).toBeNull();
});

test("rejects a token that is not HS256", async () => {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS384" })
    .setSubject(ADMIN_SUBJECT)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(futureExpiry())
    .sign(key);

  expect(await signer.verify(token)).toBeNull();
});

test("rejects an unsigned token", async () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      sub: ADMIN_SUBJECT,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      exp: futureExpiry(),
    }),
  ).toString("base64url");

  expect(await signer.verify(`${header}.${payload}.`)).toBeNull();
});

test("rejects a short secret", () => {
  expect(() => new JoseTokenSigner("too-short")).toThrow();
});
