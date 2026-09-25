import { expect, test } from "bun:test";

let session: { subject: "admin"; expiresAt: number } | null = null;
let completedPath: string | null = null;

const { mock } = (await import("bun:test")) as unknown as {
  mock: { module(id: string, factory: () => object): void };
};

mock.module("server-only", () => ({}));
mock.module("@/server/services/auth-service", () => ({
  readSession: () => Promise.resolve(session),
}));
mock.module("@vercel/blob/client", () => ({
  handleUpload: async (options: {
    body: {
      type: string;
      payload?: {
        pathname?: string;
        clientPayload?: string | null;
        multipart?: boolean;
        blob?: { pathname?: string };
      };
    };
    onBeforeGenerateToken: (
      pathname: string,
      clientPayload: string | null,
      multipart: boolean,
    ) => Promise<unknown>;
    onUploadCompleted?: (body: { blob: { pathname: string } }) => Promise<void>;
  }) => {
    if (options.body.type === "blob.upload-completed") {
      await options.onUploadCompleted?.({
        blob: { pathname: options.body.payload?.blob?.pathname ?? "" },
      });
      return { type: "blob.upload-completed", response: "ok" };
    }
    const pathname = options.body.payload?.pathname ?? "";
    await options.onBeforeGenerateToken(
      pathname,
      options.body.payload?.clientPayload ?? null,
      options.body.payload?.multipart ?? false,
    );
    return { type: "blob.generate-client-token", clientToken: "test-token" };
  },
}));

const { POST } = await import("@/app/api/admin/cv/upload/route");

function request(body: unknown): Request {
  return new Request("http://localhost/api/admin/cv/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function tokenBody(pathname: string) {
  return {
    type: "blob.generate-client-token",
    payload: { pathname, multipart: false, clientPayload: null },
  };
}

test("the upload route rejects an unauthenticated request", async () => {
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

test("the upload route issues a client token for an admin PDF upload", async () => {
  session = { subject: "admin", expiresAt: 1 };
  const response = await POST(request(tokenBody("cv/resume.pdf")));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    type: "blob.generate-client-token",
    clientToken: "test-token",
  });
});

test("the upload route logs a completed upload and rejects invalid JSON", async () => {
  session = { subject: "admin", expiresAt: 1 };
  completedPath = null;
  const original = console.log;
  console.log = (...args: unknown[]) => {
    completedPath = String(args[1] ?? "");
  };
  try {
    const completed = await POST(
      request({
        type: "blob.upload-completed",
        payload: { blob: { pathname: "cv/resume-abc.pdf" } },
      }),
    );
    expect(completed.status).toBe(200);
    expect(String(completedPath)).toBe("cv/resume-abc.pdf");
  } finally {
    console.log = original;
  }

  const invalid = await POST(
    new Request("http://localhost/api/admin/cv/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ error: "Invalid upload request." });
});
