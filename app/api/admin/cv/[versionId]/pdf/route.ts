import { CV_PDF_CONTENT_TYPE } from "@/server/domain/blob-store";
import { readSession } from "@/server/services/auth-service";
import { openCvPdf } from "@/server/services/cv-runtime";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { versionId } = await params;
  try {
    const body = await openCvPdf(versionId);
    if (!body) {
      return Response.json({ error: "CV PDF was not found." }, { status: 404 });
    }
    return new Response(body.stream, {
      headers: {
        "Content-Type": CV_PDF_CONTENT_TYPE,
        "Content-Length": String(body.size),
        "Content-Disposition": contentDisposition(body.filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The CV PDF could not be read." }, { status: 500 });
  }
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, "").replace(/["\\]/g, "").trim();
  const safe = ascii.toLowerCase().endsWith(".pdf") ? ascii : "cv.pdf";
  return `inline; filename="${safe}"`;
}
