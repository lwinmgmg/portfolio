import { expect, test } from "bun:test";

import { parseAdminEnv } from "@/server/auth/admin-env";

const salt = Buffer.alloc(16, 7).toString("base64");
const hash = Buffer.alloc(32, 9).toString("base64");
const passwordHash = `scrypt$${salt}$${hash}`;
const secret = "a".repeat(32);

test("accepts a complete admin env", () => {
  const parsed = parseAdminEnv({
    ADMIN_USERNAME: "  admin  ",
    ADMIN_PASSWORD_HASH: passwordHash,
    JWT_SECRET: secret,
  });

  expect(parsed).toEqual({
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: passwordHash,
    JWT_SECRET: secret,
  });
});

test("rejects a short JWT secret", () => {
  const parsed = parseAdminEnv({
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: passwordHash,
    JWT_SECRET: "openssl-rand-base64-32",
  });

  expect(parsed).toBeNull();
});

test("rejects a hash that is not scrypt", () => {
  const parsed = parseAdminEnv({
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD_HASH: "plaintext",
    JWT_SECRET: secret,
  });

  expect(parsed).toBeNull();
});

test("rejects a missing username", () => {
  const parsed = parseAdminEnv({
    ADMIN_PASSWORD_HASH: passwordHash,
    JWT_SECRET: secret,
  });

  expect(parsed).toBeNull();
});
