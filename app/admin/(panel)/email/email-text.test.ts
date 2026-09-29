import { expect, test } from "bun:test";

import { callbackUri, connectBanner } from "@/app/admin/(panel)/email/email-text";

test("connectBanner reads the callback result from the page URL", () => {
  expect(connectBanner({ connected: "1" })).toEqual({ status: "saved", message: "Gmail connected." });
  expect(connectBanner({ error: "denied" })).toEqual({
    status: "error",
    message: "Google sign-in was cancelled. Nothing changed.",
  });
  expect(connectBanner({ error: "exchange" })?.message).toContain("redirect URI");
  expect(connectBanner({})).toBeNull();
  expect(connectBanner({ error: "toString" })).toBeNull();
  expect(connectBanner({ error: ["denied", "state"] })).toBeNull();
});

test("callbackUri uses the forwarded protocol, http for localhost, https otherwise", () => {
  const path = "/api/admin/email/callback";
  expect(callbackUri("localhost:3000", null, path)).toBe("http://localhost:3000/api/admin/email/callback");
  expect(callbackUri("lwin.dev", null, path)).toBe("https://lwin.dev/api/admin/email/callback");
  expect(callbackUri("lwin.dev", "https, http", path)).toBe("https://lwin.dev/api/admin/email/callback");
  expect(callbackUri(null, "https", path)).toBeNull();
});
