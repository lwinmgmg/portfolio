import { expect, test } from "bun:test";

import {
  escapePasswordHashForEnv,
  hashPassword,
  ScryptPasswordVerifier,
} from "@/server/auth/password-verifier";

const verifier = new ScryptPasswordVerifier();

test("stores a scrypt hash that does not contain the password", async () => {
  const password = "correct horse battery";
  const encoded = await hashPassword(password);

  expect(encoded.startsWith("scrypt$")).toBe(true);
  expect(encoded.split("$").length).toBe(3);
  expect(encoded.includes(password)).toBe(false);
  expect(await verifier.verify(password, encoded)).toBe(true);
});

test("rejects a different password", async () => {
  const encoded = await hashPassword("correct horse battery");
  expect(await verifier.verify("wrong horse battery", encoded)).toBe(false);
});

test("uses a new salt for each hash", async () => {
  const password = "correct horse battery";
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  expect(first === second).toBe(false);
  expect(await verifier.verify(password, first)).toBe(true);
  expect(await verifier.verify(password, second)).toBe(true);
});

test("escapes dollars for Next.js env files", () => {
  expect(escapePasswordHashForEnv("scrypt$aa$bb")).toBe("scrypt\\$aa\\$bb");
});

test("rejects a malformed hash without throwing", async () => {
  expect(await verifier.verify("secret", "nope")).toBe(false);
  expect(await verifier.verify("secret", "scrypt$aa$bb")).toBe(false);
  expect(await verifier.verify("secret", "")).toBe(false);
});

test("rejects a hash whose digest was changed", async () => {
  const encoded = await hashPassword("correct horse battery");
  const [prefix, salt, digest] = encoded.split("$");
  const bytes = Buffer.from(digest, "base64");
  bytes[0] = bytes[0] === 0 ? 1 : 0;
  const tampered = `${prefix}$${salt}$${bytes.toString("base64")}`;

  expect(await verifier.verify("correct horse battery", tampered)).toBe(false);
});
