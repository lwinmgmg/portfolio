import "server-only";

import { BlobNotFoundError, del, get, head, type GetBlobResult } from "@vercel/blob";

import type { BlobBody, BlobHead, BlobStore } from "@/server/domain/blob-store";

type BlobSdk = {
  head(pathname: string): Promise<Pick<BlobHead, "size" | "contentType">>;
  get(pathname: string, options: { access: "private" }): Promise<GetBlobResult | null>;
  del(pathname: string): Promise<void>;
};

const vercelBlobSdk: BlobSdk = {
  head: (pathname) => head(pathname),
  get: (pathname, options) => get(pathname, options),
  del: (pathname) => del(pathname),
};

// `head` throws BlobNotFoundError for a missing object. `get` requires an explicit access mode.
export class VercelBlobStore implements BlobStore {
  constructor(private readonly blobs: BlobSdk = vercelBlobSdk) {}

  async head(pathname: string): Promise<BlobHead | null> {
    try {
      const result = await this.blobs.head(pathname);
      return { size: result.size, contentType: result.contentType };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async read(pathname: string): Promise<BlobBody | null> {
    const result = await this.blobs.get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { stream: result.stream, size: result.blob.size };
  }

  async readBytes(pathname: string): Promise<Uint8Array | null> {
    const body = await this.read(pathname);
    if (!body) return null;
    return collectBytes(body.stream);
  }

  async delete(pathname: string): Promise<void> {
    await this.blobs.del(pathname);
  }
}

async function collectBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
