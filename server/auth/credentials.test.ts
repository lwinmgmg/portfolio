import { expect, test } from "bun:test";

import { credentialsMatch } from "@/server/auth/credentials";
import type { PasswordVerifier } from "@/server/auth/password-verifier";

const admin = { username: "admin", passwordHash: "scrypt$salt$hash" };

test("checks the password even when the username is wrong", async () => {
  let calls = 0;
  const passwords: PasswordVerifier = {
    async verify() {
      calls += 1;
      return true;
    },
  };

  const matched = await credentialsMatch(
    { username: "someone-else", password: "secret" },
    admin,
    passwords,
  );

  expect(calls).toBe(1);
  expect(matched).toBe(false);
});

test("accepts the username and password together", async () => {
  const passwords: PasswordVerifier = {
    async verify(password) {
      return password === "secret";
    },
  };

  const matched = await credentialsMatch(
    { username: "admin", password: "secret" },
    admin,
    passwords,
  );

  expect(matched).toBe(true);
});

test("rejects a wrong password for the admin username", async () => {
  const passwords: PasswordVerifier = {
    async verify() {
      return false;
    },
  };

  const matched = await credentialsMatch(
    { username: "admin", password: "nope" },
    admin,
    passwords,
  );

  expect(matched).toBe(false);
});
