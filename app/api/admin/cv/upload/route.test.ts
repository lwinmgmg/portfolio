import { createHmac } from "node:crypto";

import { expect, test } from "bun:test";
import { getPayloadFromClientToken } from "@vercel/blob/client";

let session: { subject: "admin"; expiresAt: number } | null = null;
let sessionReads = 0;

const { mock, beforeAll, afterAll } = (await import("bun:test")) as unknown as {
  mock: { module(id: string, factory: () => object): void };
  beforeAll(fn: () => void): void;
  afterAll(fn: () => void): void;
};

mock.module("server-only", () => ({}));
mock.module("@/server/services/auth-service", () => ({
  readSession: () => {
    sessionReads += 1;
    return Promise.resolve(session);
  },
}));

const { POST } = await import("@/app/api/admin/cv/upload/route");

const testBlobToken = "vercel_blob_rw_test_secret";
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const originalCallbackUrl = process.env.VERCEL_BLOB_CALLBACK_URL;

beforeAll(() => {
  process.env.BLOB_READ_WRITE_TOKEN = testBlobToken;
  process.env.VERCEL_BLOB_CALLBACK_URL = "https://portfolio.example.test";
});

afterAll(() => {
  if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;

  if (originalCallbackUrl === undefined) delete process.env.VERCEL_BLOB_CALLBACK_URL;
  else process.env.VERCEL_BLOB_CALLBACK_URL = originalCallbackUrl;
});

function request(body: unknown, signature?: string): Request {
  return new Request("http://localhost/api/admin/cv/upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-vercel-signature": signature } : {}),
    },
    body: JSON.stringify(body),
  });
}

function tokenBody(pathname: string) {
  return {
    type: "blob.generate-client-token",
    payload: { pathname, multipart: false, clientPayload: null },
  };
}

function completedBody(pathname = "cv/resume-abc.pdf") {
  return {
    type: "blob.upload-completed",
    payload: {
      blob: {
        url: `https://portfolio.example.test/${pathname}`,
        downloadUrl: `https://portfolio.example.test/${pathname}?download=1`,
        pathname,
        contentType: "application/pdf",
        contentDisposition: "attachment",
        etag: "test-etag",
      },
    },
  };
}

function sign(body: unknown): string {
  return createHmac("sha256", testBlobToken).update(JSON.stringify(body)).digest("hex");
}

test("the upload route rejects an unauthenticated token request", async () => {
  session = null;
  const response = await POST(request(tokenBody("cv/resume.pdf")));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Not authenticated" });
});

test("the upload route rejects a non-PDF pathname", async () => {
  session = { subject: "admin", expiresAt: 1 };
  const response = await POST(request(tokenBody("cv/notes.txt")));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "The PDF must be stored at a cv/ path.",
  });
});

test("the upload route issues a client token with CV constraints and a callback URL", async () => {
  session = { subject: "admin", expiresAt: 1 };
  const response = await POST(request(tokenBody("cv/resume.pdf")));
  expect(response.status).toBe(200);

  const result = (await response.json()) as { type: string; clientToken: string };
  expect(result.type).toBe("blob.generate-client-token");
  expect(result.clientToken.startsWith("vercel_blob_client_test_")).toBe(true);
  const payload = getPayloadFromClientToken(result.clientToken);
  expect(payload.pathname).toBe("cv/resume.pdf");
  expect(payload.allowedContentTypes).toEqual(["application/pdf"]);
  expect(payload.maximumSizeInBytes).toBe(10 * 1024 * 1024);
  expect(payload.onUploadCompleted?.callbackUrl).toBe(
    "https://portfolio.example.test/api/admin/cv/upload",
  );
});

test("a signed completion callback succeeds without an admin session", async () => {
  session = null;
  sessionReads = 0;
  const body = completedBody();
  let completedPath: string | null = null;
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    completedPath = String(args[1] ?? "");
  };

  try {
    const response = await POST(request(body, sign(body)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "blob.upload-completed",
      response: "ok",
    });
    expect(String(completedPath)).toBe("cv/resume-abc.pdf");
    expect(sessionReads).toBe(0);
  } finally {
    console.log = originalLog;
  }
});

test("an unsigned or tampered completion callback is rejected", async () => {
  session = null;
  const signedBody = completedBody();
  const originalError = console.error;
  console.error = () => {};

  try {
    const unsigned = await POST(request(signedBody));
    expect(unsigned.status).toBe(400);
    expect(await unsigned.json()).toEqual({ error: "Vercel Blob: Missing callback signature" });

    const tampered = await POST(request(completedBody("cv/other.pdf"), sign(signedBody)));
    expect(tampered.status).toBe(400);
    expect(await tampered.json()).toEqual({ error: "Vercel Blob: Invalid callback signature" });
  } finally {
    console.error = originalError;
  }
});

test("malformed JSON and malformed request bodies return 400", async () => {
  session = { subject: "admin", expiresAt: 1 };
  const invalidJson = await POST(
    new Request("http://localhost/api/admin/cv/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );
  expect(invalidJson.status).toBe(400);
  expect(await invalidJson.json()).toEqual({ error: "Invalid upload request." });

  for (const body of [
    null,
    [],
    42,
    {},
    { type: "blob.generate-client-token", payload: null },
    { type: "blob.upload-completed", payload: { blob: null } },
  ]) {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid upload request." });
  }
});
