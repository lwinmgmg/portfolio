import { expect, test } from "bun:test";

import { cvDownloadFilename } from "@/server/cv/cv-download";

test("cvDownloadFilename joins name words with hyphens", () => {
  expect(cvDownloadFilename("Jane Doe")).toBe("Jane-Doe-CV.pdf");
  expect(cvDownloadFilename("  LWIN MAUNG  MAUNG ")).toBe("LWIN-MAUNG-MAUNG-CV.pdf");
});

test("cvDownloadFilename drops punctuation and path characters", () => {
  expect(cvDownloadFilename("Jane O'Doe, PhD")).toBe("Jane-O-Doe-PhD-CV.pdf");
  expect(cvDownloadFilename('../"evil"\\name')).toBe("evil-name-CV.pdf");
});

test("cvDownloadFilename keeps non-ASCII letters", () => {
  expect(cvDownloadFilename("José Müller")).toBe("José-Müller-CV.pdf");
  expect(cvDownloadFilename("အောင်ကို")).toBe("အောင်ကို-CV.pdf");
});

test("cvDownloadFilename falls back when there is no usable name", () => {
  expect(cvDownloadFilename(null)).toBe("CV.pdf");
  expect(cvDownloadFilename(undefined)).toBe("CV.pdf");
  expect(cvDownloadFilename(" -- ")).toBe("CV.pdf");
});
