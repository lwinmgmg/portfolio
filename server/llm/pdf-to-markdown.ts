export type PdfToMarkdown = (pdf: Uint8Array) => Promise<string>;

export class PdfConversionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfConversionError";
  }
}

/** Convert a PDF locally so the LLM receives Markdown rather than PDF bytes. */
export const convertPdfToMarkdown: PdfToMarkdown = async (pdf) => {
  if (pdf.byteLength === 0) {
    throw new PdfConversionError("The PDF is empty.");
  }

  let markdown: string;
  try {
    const { default: pdf2md } = await import("@opendocsg/pdf2md");
    markdown = await pdf2md(pdf);
  } catch (cause) {
    throw new PdfConversionError("Could not convert the PDF to Markdown.", { cause });
  }

  if (markdown.replaceAll("<!-- PAGE_BREAK -->", "").trim().length === 0) {
    throw new PdfConversionError(
      "The PDF has no extractable text. Use a text-based PDF or an OCR mode.",
    );
  }

  return markdown.trim();
};
