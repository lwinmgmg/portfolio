import { expect, test } from "bun:test";

import { attachmentDisposition, ifNoneMatchIncludes } from "@/server/http/download-headers";

test("attachmentDisposition sends an ASCII name and the exact UTF-8 name", () => {
  expect(attachmentDisposition("Jane-Doe-CV.pdf")).toBe(
    `attachment; filename="Jane-Doe-CV.pdf"; filename*=UTF-8''Jane-Doe-CV.pdf`,
  );
  expect(attachmentDisposition("José-Müller-CV.pdf")).toBe(
    `attachment; filename="Jose-Muller-CV.pdf"; filename*=UTF-8''Jos%C3%A9-M%C3%BCller-CV.pdf`,
  );
});

test("attachmentDisposition replaces scripts with no ASCII form", () => {
  expect(attachmentDisposition("အောင်ကို-CV.pdf")).toContain(`attachment; filename="CV.pdf";`);
  expect(attachmentDisposition("Жанна.pdf")).toContain(`attachment; filename="download.pdf";`);
});

test("attachmentDisposition keeps quotes and control characters out of the header", () => {
  const header = attachmentDisposition('a"b\\c\r\nd\'(e)*.pdf');
  expect(header).toBe(
    `attachment; filename="abc-d'(e)*.pdf"; filename*=UTF-8''a%22b%5Cc%0D%0Ad%27%28e%29%2A.pdf`,
  );
});

test("ifNoneMatchIncludes matches strong, weak, listed and wildcard tags", () => {
  const etag = '"cv-1"';
  expect(ifNoneMatchIncludes('"cv-1"', etag)).toBe(true);
  expect(ifNoneMatchIncludes('W/"cv-1"', etag)).toBe(true);
  expect(ifNoneMatchIncludes('"cv-0", "cv-1"', etag)).toBe(true);
  expect(ifNoneMatchIncludes("*", etag)).toBe(true);
});

test("ifNoneMatchIncludes rejects other or missing tags", () => {
  const etag = '"cv-1"';
  expect(ifNoneMatchIncludes(null, etag)).toBe(false);
  expect(ifNoneMatchIncludes("", etag)).toBe(false);
  expect(ifNoneMatchIncludes('"cv-2"', etag)).toBe(false);
  expect(ifNoneMatchIncludes("cv-1", etag)).toBe(false);
});
