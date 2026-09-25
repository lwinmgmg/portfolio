import { expect, test } from "bun:test";
import { BlobNotFoundError, type GetBlobResult } from "@vercel/blob";

const { mock } = (await import("bun:test")) as unknown as {
  mock: { module(id: string, factory: () => object): void };
};

mock.module("server-only", () => ({}));

const { VercelBlobStore } = await import("@/server/storage/vercel-blob-store");

type FakeSdk = {
  head(pathname: string): Promise<{ size: number; contentType: string }>;
  get(pathname: string, options: { access: "private" }): Promise<GetBlobResult | null>;
  del(pathname: string): Promise<void>;
};

function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

function found(size: number): GetBlobResult {
  return {
    statusCode: 200,
    stream: streamOf([1, 2], [3]),
    headers: new Headers(),
    blob: {
      url: "https://example.private.blob.vercel-storage.com/cv/resume.pdf",
      downloadUrl: "https://example.private.blob.vercel-storage.com/cv/resume.pdf?download=1",
      pathname: "cv/resume.pdf",
      contentType: "application/pdf",
      contentDisposition: "attachment",
      cacheControl: "public, max-age=0",
      uploadedAt: new Date("2026-09-25T12:00:00.000Z"),
      etag: "\"abc\"",
      size,
    },
  };
}

test("head returns metadata and maps a missing blob to null", async () => {
  const calls: string[] = [];
  const sdk: FakeSdk = {
    head: (pathname) => {
      calls.push(pathname);
      if (pathname === "cv/missing.pdf") return Promise.reject(new BlobNotFoundError());
      return Promise.resolve({ size: 12, contentType: "application/pdf" });
    },
    get: () => Promise.reject(new Error("get was not expected")),
    del: () => Promise.reject(new Error("del was not expected")),
  };
  const store = new VercelBlobStore(sdk);

  expect(await store.head("cv/resume.pdf")).toEqual({
    size: 12,
    contentType: "application/pdf",
  });
  expect(await store.head("cv/missing.pdf")).toBeNull();
  expect(calls).toEqual(["cv/resume.pdf", "cv/missing.pdf"]);

  const failure = new Error("denied");
  const failing = new VercelBlobStore({
    ...sdk,
    head: () => Promise.reject(failure),
  });
  let caught: unknown = null;
  try {
    await failing.head("cv/resume.pdf");
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
});

test("read and readBytes use the private store and return null when the body is absent", async () => {
  const options: Array<{ access: "private" }> = [];
  const sdk: FakeSdk = {
    head: () => Promise.reject(new Error("head was not expected")),
    get: (_pathname, getOptions) => {
      options.push(getOptions);
      if (options.length === 1) return Promise.resolve(found(3));
      if (options.length === 2) return Promise.resolve(found(3));
      if (options.length === 3) return Promise.resolve(null);
      return Promise.resolve({
        statusCode: 304,
        stream: null,
        headers: new Headers(),
        blob: {
          url: "https://example.private.blob.vercel-storage.com/cv/resume.pdf",
          downloadUrl: "https://example.private.blob.vercel-storage.com/cv/resume.pdf?download=1",
          pathname: "cv/resume.pdf",
          contentType: null,
          contentDisposition: "",
          cacheControl: "",
          uploadedAt: new Date("2026-09-25T12:00:00.000Z"),
          etag: "\"abc\"",
          size: null,
        },
      });
    },
    del: () => Promise.reject(new Error("del was not expected")),
  };
  const store = new VercelBlobStore(sdk);

  const body = await store.read("cv/resume.pdf");
  const bytes = await store.readBytes("cv/resume.pdf");

  expect(body?.size).toBe(3);
  expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  expect(await store.read("cv/missing.pdf")).toBeNull();
  expect(await store.readBytes("cv/unchanged.pdf")).toBeNull();
  expect(options).toEqual([
    { access: "private" },
    { access: "private" },
    { access: "private" },
    { access: "private" },
  ]);
});

test("delete removes the pathname", async () => {
  const deleted: string[] = [];
  const store = new VercelBlobStore({
    head: () => Promise.reject(new Error("head was not expected")),
    get: () => Promise.reject(new Error("get was not expected")),
    del: (pathname) => {
      deleted.push(pathname);
      return Promise.resolve();
    },
  });

  await store.delete("cv/resume.pdf");
  expect(deleted).toEqual(["cv/resume.pdf"]);
});
