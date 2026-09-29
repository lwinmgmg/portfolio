import type { OutgoingEmail } from "@/server/domain/email";

const CRLF = "\r\n";
const BODY_LINE_LENGTH = 76;
const HEADER_LINE_LENGTH = 78;
// 42 bytes are 56 base64 characters: a 68-character encoded word, within RFC 2047's 75, and
// "Subject: " plus the first word stays within the 78-character line.
const ENCODED_WORD_BYTES = 42;
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const LINE_BREAK = /[\r\n]/;

/** A header value that would change the message's structure, such as a line break. */
export class MimeHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimeHeaderError";
  }
}

/** A plain-text RFC 5322 message with a base64 UTF-8 body, lines joined with CRLF. */
export function buildMimeMessage(email: OutgoingEmail): string {
  return [
    `To: ${recipientHeader(email.to)}`,
    `Subject: ${subjectHeader(email.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(email.text),
  ].join(CRLF);
}

/** The message as base64url, the form the Gmail API takes in its `raw` field. */
export function buildGmailRaw(email: OutgoingEmail): string {
  return Buffer.from(buildMimeMessage(email), "utf8").toString("base64url");
}

function recipientHeader(to: string): string {
  if (LINE_BREAK.test(to)) throw new MimeHeaderError("The To header must not contain a line break.");
  if (to.length === 0 || !PRINTABLE_ASCII.test(to)) {
    throw new MimeHeaderError("The To header must be a non-empty ASCII address.");
  }
  return to;
}

function subjectHeader(subject: string): string {
  if (LINE_BREAK.test(subject)) {
    throw new MimeHeaderError("The Subject header must not contain a line break.");
  }
  const fitsOnOneLine = "Subject: ".length + subject.length <= HEADER_LINE_LENGTH;
  if (PRINTABLE_ASCII.test(subject) && fitsOnOneLine) return subject;
  // RFC 2047 encoded words, folded one per line. Decoders drop the whitespace between them.
  return splitUtf8(subject, ENCODED_WORD_BYTES)
    .map((bytes) => `=?UTF-8?B?${bytes.toString("base64")}?=`)
    .join(`${CRLF} `);
}

// Splits on code point boundaries so no encoded word holds half a character.
function splitUtf8(text: string, maxBytes: number): Buffer[] {
  const chunks: Buffer[] = [];
  let current: Buffer[] = [];
  let size = 0;
  for (const char of text) {
    const bytes = Buffer.from(char, "utf8");
    if (size + bytes.length > maxBytes && size > 0) {
      chunks.push(Buffer.concat(current));
      current = [];
      size = 0;
    }
    current.push(bytes);
    size += bytes.length;
  }
  if (size > 0) chunks.push(Buffer.concat(current));
  return chunks;
}

function base64Body(text: string): string {
  // text/plain is sent with CRLF line ends (RFC 2046), whatever the source used.
  const canonical = text.replace(/\r\n?/g, "\n").replace(/\n/g, CRLF);
  const encoded = Buffer.from(canonical, "utf8").toString("base64");
  const lines: string[] = [];
  for (let start = 0; start < encoded.length; start += BODY_LINE_LENGTH) {
    lines.push(encoded.slice(start, start + BODY_LINE_LENGTH));
  }
  return lines.join(CRLF);
}
