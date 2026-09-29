import type { ChatMessage, ChatRequest, ContentPart } from "@/server/domain/llm";
import {
  convertPdfToMarkdown,
  PdfConversionError,
  type PdfToMarkdown,
} from "@/server/llm/pdf-to-markdown";

const PDF_DATA_URL = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/i;

/** Prepare the local PDF mode before the request reaches OpenRouter. */
export async function preparePdfChatRequest(
  request: ChatRequest,
  toMarkdown: PdfToMarkdown = convertPdfToMarkdown,
): Promise<ChatRequest> {
  if (request.pdfEngine !== "pdf-to-md") return request;

  const messages: ChatMessage[] = [];
  for (const message of request.messages) {
    if (message.role === "tool" || typeof message.content === "string") {
      messages.push(message);
      continue;
    }

    const content: ContentPart[] = [];
    for (const part of message.content) {
      if (part.type !== "file") {
        content.push(part);
        continue;
      }

      const match = PDF_DATA_URL.exec(part.dataUrl);
      if (!match) {
        throw new PdfConversionError("Local PDF conversion requires a PDF data URL.");
      }

      const markdown = await toMarkdown(Buffer.from(match[1], "base64"));
      if (markdown.trim().length === 0) {
        throw new PdfConversionError("The PDF has no extractable text.");
      }
      content.push({
        type: "text",
        text: `PDF ${JSON.stringify(part.filename)} converted to Markdown:\n\n${markdown}`,
      });
    }
    messages.push({ ...message, content });
  }

  return { ...request, messages, pdfEngine: undefined };
}
