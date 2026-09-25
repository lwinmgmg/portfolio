export const CV_PDF_MAX_BYTES = 10 * 1024 * 1024;

export const CV_PDF_CONTENT_TYPE = "application/pdf";

export type BlobHead = {
  size: number;
  contentType: string;
};

export type BlobBody = {
  stream: ReadableStream<Uint8Array>;
  size: number;
};

export interface BlobStore {
  head(pathname: string): Promise<BlobHead | null>;
  read(pathname: string): Promise<BlobBody | null>;
  readBytes(pathname: string): Promise<Uint8Array | null>;
  delete(pathname: string): Promise<void>;
}
