import { expect, test } from "bun:test";

import { parseLoginForm } from "@/server/auth/login-schema";

test("trims the username and keeps the password exact", () => {
  const parsed = parseLoginForm({
    username: "  admin  ",
    password: " secret ",
  });

  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.username).toBe("admin");
  expect(parsed.data.password).toBe(" secret ");
});

test("reports each missing field", () => {
  const parsed = parseLoginForm({ username: "   ", password: "" });

  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  expect(parsed.fieldErrors.username).toEqual(["Username is required."]);
  expect(parsed.fieldErrors.password).toEqual(["Password is required."]);
});

test("rejects a non-string username", () => {
  const parsed = parseLoginForm({ username: 1, password: "secret" });

  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  expect(parsed.fieldErrors.username).toEqual(["Username is required."]);
});

test("rejects a password that is too long", () => {
  const parsed = parseLoginForm({
    username: "admin",
    password: "a".repeat(1025),
  });

  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  expect(parsed.fieldErrors.password).toEqual(["Password is too long."]);
});
