import { expect, test } from "bun:test";

import { parseEmailEnv, readEmailEnv } from "@/server/email/email-env";

const complete = {
  GMAIL_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GMAIL_CLIENT_SECRET: "client-secret",
  GMAIL_REFRESH_TOKEN: "1//refresh-token",
  CONTACT_EMAIL_TO: "owner@example.com",
};

test("returns null when nothing is set", () => {
  expect(readEmailEnv({})).toBeNull();
});

test("returns null when any required value is missing or blank", () => {
  for (const name of Object.keys(complete)) {
    expect(readEmailEnv({ ...complete, [name]: undefined })).toBeNull();
    expect(readEmailEnv({ ...complete, [name]: "   " })).toBeNull();
  }
});

test("applies the limit defaults when only the required values are set", () => {
  expect(readEmailEnv(complete)).toEqual({
    ...complete,
    CONTACT_EMAIL_DAILY_LIMIT: 20,
    CONTACT_EMAIL_SESSION_LIMIT: 2,
  });
});

test("trims values and keeps explicit limits", () => {
  expect(
    readEmailEnv({
      GMAIL_CLIENT_ID: "  id  ",
      GMAIL_CLIENT_SECRET: "  secret  ",
      GMAIL_REFRESH_TOKEN: "  token  ",
      CONTACT_EMAIL_TO: "  owner@example.com  ",
      CONTACT_EMAIL_DAILY_LIMIT: "  5  ",
      CONTACT_EMAIL_SESSION_LIMIT: " 1 ",
    }),
  ).toEqual({
    GMAIL_CLIENT_ID: "id",
    GMAIL_CLIENT_SECRET: "secret",
    GMAIL_REFRESH_TOKEN: "token",
    CONTACT_EMAIL_TO: "owner@example.com",
    CONTACT_EMAIL_DAILY_LIMIT: 5,
    CONTACT_EMAIL_SESSION_LIMIT: 1,
  });
});

test("blank limits fall back to the defaults", () => {
  expect(
    readEmailEnv({ ...complete, CONTACT_EMAIL_DAILY_LIMIT: " ", CONTACT_EMAIL_SESSION_LIMIT: "" }),
  ).toMatchObject({ CONTACT_EMAIL_DAILY_LIMIT: 20, CONTACT_EMAIL_SESSION_LIMIT: 2 });
});

test("rejects a recipient that is not an email address", () => {
  expect(readEmailEnv({ ...complete, CONTACT_EMAIL_TO: "owner" })).toBeNull();
  expect(readEmailEnv({ ...complete, CONTACT_EMAIL_TO: "owner@example.com\r\nBcc: x@example.com" })).toBeNull();
});

test("rejects limits that are not positive integers", () => {
  for (const value of ["0", "-1", "2.5", "many"]) {
    expect(readEmailEnv({ ...complete, CONTACT_EMAIL_DAILY_LIMIT: value })).toBeNull();
    expect(readEmailEnv({ ...complete, CONTACT_EMAIL_SESSION_LIMIT: value })).toBeNull();
  }
});

test("parseEmailEnv names the variable that failed", () => {
  const parsed = parseEmailEnv({ ...complete, GMAIL_REFRESH_TOKEN: undefined });
  expect(parsed.success).toBe(false);
  expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["GMAIL_REFRESH_TOKEN"]);
});
