import { expect, test } from "bun:test";

import {
  convertPdfToMarkdown,
  PdfConversionError,
} from "@/server/llm/pdf-to-markdown";

function pdfWithText(text: string): Uint8Array {
  const escaped = text.replace(/[\\()]/g, "\\$&");
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(document);
}

test("converts a text PDF to Markdown locally", async () => {
  const markdown = await convertPdfToMarkdown(pdfWithText("Jane Doe CV"));
  expect(markdown.includes("Jane Doe CV")).toBe(true);
});

test("rejects a PDF with no extractable text", async () => {
  await expect(convertPdfToMarkdown(pdfWithText(""))).rejects.toBeInstanceOf(PdfConversionError);
});
