import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { readSession } from "@/server/services/auth-service";
import { cvUploadConstraints, InvalidCvError } from "@/server/services/cv-service";

class UnauthenticatedUploadError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedUploadError";
  }
}

export async function POST(request: Request): Promise<Response> {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (!isHandleUploadBody(parsedBody)) {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const body = parsedBody;

  if (body.type === "blob.generate-client-token") {
    const session = await readSession();
    if (!session) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    // Reject a non-PDF before handleUpload, which requires a blob token before it calls back.
    const rejected = rejectCvPath(body.payload.pathname);
    if (rejected) return rejected;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const current = await readSession();
        if (!current) throw new UnauthenticatedUploadError();
        return cvUploadConstraints(pathname);
      },
      // Vercel calls this after a deployed upload. It does not run on localhost.
      onUploadCompleted: async ({ blob }) => {
        console.log("CV blob upload completed", blob.pathname);
      },
    });
    return Response.json(jsonResponse);
  } catch (error) {
    if (!(error instanceof InvalidCvError) && !(error instanceof UnauthenticatedUploadError)) {
      console.error(error);
    }
    const status = error instanceof UnauthenticatedUploadError ? 401 : 400;
    const message = error instanceof Error ? error.message : "Upload rejected.";
    return Response.json({ error: message }, { status });
  }
}

function isHandleUploadBody(value: unknown): value is HandleUploadBody {
  if (!isRecord(value)) return false;

  if (value.type === "blob.generate-client-token") {
    const payload = value.payload;
    return (
      isRecord(payload) &&
      typeof payload.pathname === "string" &&
      typeof payload.multipart === "boolean" &&
      (payload.clientPayload === null || typeof payload.clientPayload === "string")
    );
  }

  if (value.type === "blob.upload-completed") {
    const payload = value.payload;
    if (!isRecord(payload) || !isRecord(payload.blob)) return false;

    const blob = payload.blob;
    return (
      typeof blob.url === "string" &&
      typeof blob.downloadUrl === "string" &&
      typeof blob.pathname === "string" &&
      typeof blob.contentType === "string" &&
      typeof blob.contentDisposition === "string" &&
      typeof blob.etag === "string" &&
      (payload.tokenPayload === undefined ||
        payload.tokenPayload === null ||
        typeof payload.tokenPayload === "string")
    );
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectCvPath(pathname: string): Response | null {
  try {
    cvUploadConstraints(pathname);
    return null;
  } catch (error) {
    if (error instanceof InvalidCvError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
