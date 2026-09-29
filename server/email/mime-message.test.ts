import { describe, expect, test } from "bun:test";

import { buildGmailRaw, buildMimeMessage, MimeHeaderError } from "@/server/email/mime-message";

const email = { to: "owner@example.com", subject: "Hello", text: "Hi there." };

function split(message: string): { headers: string[]; body: string } {
  const end = message.indexOf("\r\n\r\n");
  return { headers: message.slice(0, end).split("\r\n"), body: message.slice(end + 4) };
}

function decodeBody(body: string): string {
  return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
}

/** The message of the MimeHeaderError that `build` throws. */
function headerError(build: () => unknown): string {
  try {
    build();
  } catch (error) {
    expect(error instanceof MimeHeaderError).toBe(true);
    return (error as MimeHeaderError).message;
  }
  throw new Error("Expected a MimeHeaderError");
}

// Enough of RFC 2047 to read back what buildMimeMessage writes.
function decodeSubject(headers: string[]): string {
  const start = headers.findIndex((line) => line.startsWith("Subject: "));
  const lines = [headers[start].slice("Subject: ".length)];
  for (const line of headers.slice(start + 1)) {
    if (!line.startsWith(" ")) break;
    lines.push(line.slice(1));
  }
  return lines
    .map((word) => {
      const match = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=$/.exec(word);
      return match ? Buffer.from(match[1], "base64") : Buffer.from(word, "utf8");
    })
    .reduce((all, part) => Buffer.concat([all, part]), Buffer.alloc(0))
    .toString("utf8");
}

describe("buildMimeMessage", () => {
  test("writes the plain-text headers in order, then a blank line and the body", () => {
    const { headers, body } = split(buildMimeMessage(email));
    expect(headers).toEqual([
      "To: owner@example.com",
      "Subject: Hello",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ]);
    expect(decodeBody(body)).toBe("Hi there.");
  });

  test("keeps a short ASCII subject as it is", () => {
    const { headers } = split(
      buildMimeMessage({ ...email, subject: "Portfolio chat: message from a visitor" }),
    );
    expect(headers[1]).toBe("Subject: Portfolio chat: message from a visitor");
  });

  test("encodes a non-ASCII subject as RFC 2047 words", () => {
    const subject = "Café ☕ — привет";
    const { headers } = split(buildMimeMessage({ ...email, subject }));
    expect(headers[1].startsWith("Subject: =?UTF-8?B?")).toBe(true);
    expect(headers.every((line) => /^[\x20-\x7e]*$/.test(line))).toBe(true);
    expect(decodeSubject(headers)).toBe(subject);
  });

  test("folds a long subject into encoded words of at most 75 characters", () => {
    const subject = "こんにちは、ポートフォリオのチャットからのメッセージです。".repeat(3);
    const { headers } = split(buildMimeMessage({ ...email, subject }));
    const words = headers.filter((line) => line.includes("=?UTF-8?B?"));
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      expect(word.replace(/^(Subject: | )/, "").length).toBeLessThanOrEqual(75);
    }
    expect(decodeSubject(headers)).toBe(subject);
  });

  test("encodes a long ASCII subject too, so no header line runs past 78 characters", () => {
    const subject = "A".repeat(120);
    const { headers } = split(buildMimeMessage({ ...email, subject }));
    expect(headers.every((line) => line.length <= 78)).toBe(true);
    expect(decodeSubject(headers)).toBe(subject);
  });

  test("never splits an emoji across encoded words", () => {
    const subject = "😀".repeat(40);
    const { headers } = split(buildMimeMessage({ ...email, subject }));
    expect(decodeSubject(headers)).toBe(subject);
  });

  test("encodes a Unicode body with long lines and wraps the base64 at 76 characters", () => {
    const text = `Hi Lwin,\n\n${"Ünïcödé text on one very long line. ".repeat(20)}\n\n— Jane 👋`;
    const { body } = split(buildMimeMessage({ ...email, text }));
    const lines = body.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(0, -1).every((line) => line.length === 76)).toBe(true);
    expect(lines.at(-1)!.length).toBeLessThanOrEqual(76);
    expect(decodeBody(body)).toBe(text.replace(/\n/g, "\r\n"));
  });

  test("sends every line end in the body as CRLF", () => {
    const { body } = split(buildMimeMessage({ ...email, text: "a\nb\r\nc\rd" }));
    expect(decodeBody(body)).toBe("a\r\nb\r\nc\r\nd");
  });

  test("allows an empty body", () => {
    const { body } = split(buildMimeMessage({ ...email, text: "" }));
    expect(body).toBe("");
  });

  test("rejects a line break in To", () => {
    for (const to of [
      "owner@example.com\r\nBcc: attacker@example.com",
      "owner@example.com\nBcc: attacker@example.com",
      "owner@example.com\rBcc: attacker@example.com",
    ]) {
      expect(headerError(() => buildMimeMessage({ ...email, to }))).toContain("line break");
    }
  });

  test("rejects a line break in Subject", () => {
    for (const subject of [
      "Hello\r\nBcc: attacker@example.com",
      "Hello\n\nInjected body",
      "Hello\rX-Spam: yes",
    ]) {
      expect(headerError(() => buildMimeMessage({ ...email, subject }))).toContain("line break");
    }
  });

  test("rejects an empty or non-ASCII To", () => {
    for (const to of ["", "öwner@example.com", "owner@example.com\u0000"]) {
      expect(headerError(() => buildMimeMessage({ ...email, to }))).toContain("ASCII");
    }
  });

  test("a line break in the body cannot add a header, since the body is base64", () => {
    const text = "Hello\r\n\r\nBcc: attacker@example.com";
    const { headers } = split(buildMimeMessage({ ...email, text }));
    expect(headers).toHaveLength(5);
  });
});

describe("buildGmailRaw", () => {
  test("is the message as unpadded base64url", () => {
    const raw = buildGmailRaw({ ...email, subject: "Café?>>", text: "ÿÿÿ~~~" });
    expect(/^[A-Za-z0-9_-]+$/.test(raw)).toBe(true);
    expect(Buffer.from(raw, "base64url").toString("utf8")).toBe(
      buildMimeMessage({ ...email, subject: "Café?>>", text: "ÿÿÿ~~~" }),
    );
  });
});
