import { CV_PDF_CONTENT_TYPE } from "@/server/domain/blob-store";
import { attachmentDisposition, ifNoneMatchIncludes } from "@/server/http/download-headers";
import { openPublishedCvPdf } from "@/server/services/cv-runtime";

// The CDN keeps the file for 5 minutes, so a new publish is served within that window.
// The ETag is the published version id, which changes with every publish.
const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

export async function GET(request: Request): Promise<Response> {
  try {
    const pdf = await openPublishedCvPdf();
    if (!pdf) {
      return Response.json({ error: "No CV has been published." }, { status: 404 });
    }

    const etag = `"${pdf.versionId}"`;
    const cacheHeaders = { ETag: etag, "Cache-Control": CACHE_CONTROL };

    if (ifNoneMatchIncludes(request.headers.get("if-none-match"), etag)) {
      await pdf.stream.cancel();
      return new Response(null, { status: 304, headers: cacheHeaders });
    }

    return new Response(pdf.stream, {
      headers: {
        ...cacheHeaders,
        "Content-Type": CV_PDF_CONTENT_TYPE,
        "Content-Length": String(pdf.size),
        "Content-Disposition": attachmentDisposition(pdf.filename),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "The CV could not be downloaded." }, { status: 500 });
  }
}
