import { expect, test } from "bun:test";

import {
  formatDateRange,
  formatYearMonth,
  joinPresent,
  mailtoHref,
  safeWebUrl,
  toParagraphs,
  truncateText,
} from "@/app/(public)/_components/cv/cv-format";

test("toParagraphs splits on blank lines and drops empty paragraphs", () => {
  expect(toParagraphs("One\nstill one.\n\n  Two  \n \n\n")).toEqual(["One\nstill one.", "Two"]);
  expect(toParagraphs("  ")).toEqual([]);
  expect(toParagraphs(null)).toEqual([]);
});

test("formatYearMonth names the month and keeps a bare year", () => {
  expect(formatYearMonth("2021-04")).toBe("Apr 2021");
  expect(formatYearMonth("2021-12")).toBe("Dec 2021");
  expect(formatYearMonth("2021")).toBe("2021");
  expect(formatYearMonth("spring 2021")).toBe("spring 2021");
});

test("formatDateRange handles current roles, open ends and single dates", () => {
  expect(formatDateRange("2021-04", null, true)).toBe("Apr 2021 – Present");
  expect(formatDateRange("2019-01", "2021-03")).toBe("Jan 2019 – Mar 2021");
  expect(formatDateRange("2020", "2020")).toBe("2020");
  expect(formatDateRange("2020-05", null)).toBe("May 2020");
  expect(formatDateRange(null, "2020-05")).toBe("May 2020");
  expect(formatDateRange(null, null)).toBeNull();
  expect(formatDateRange(null, null, true)).toBe("Present");
});

test("safeWebUrl allows only http(s) and upgrades bare hosts", () => {
  expect(safeWebUrl("https://github.com/jane")).toBe("https://github.com/jane");
  expect(safeWebUrl(" github.com/jane ")).toBe("https://github.com/jane");
  expect(safeWebUrl("http://jane.example")).toBe("http://jane.example/");
  expect(safeWebUrl("javascript:alert(1)")).toBeNull();
  expect(safeWebUrl("data:text/html,hi")).toBeNull();
  expect(safeWebUrl("not a url")).toBeNull();
  expect(safeWebUrl("")).toBeNull();
  expect(safeWebUrl(null)).toBeNull();
});

test("mailtoHref accepts plain addresses only", () => {
  expect(mailtoHref(" jane@example.com ")).toBe("mailto:jane@example.com");
  expect(mailtoHref("jane@example.com?subject=x<y>")).toBeNull();
  expect(mailtoHref("jane")).toBeNull();
  expect(mailtoHref(null)).toBeNull();
});

test("truncateText cuts on a word boundary within the limit", () => {
  expect(truncateText("  Short   text ", 160)).toBe("Short text");
  const long = "Builds reliable web products for teams, and more. ".repeat(6);
  const cut = truncateText(long, 160);
  expect(cut.length).toBeLessThanOrEqual(160);
  expect(cut.endsWith("…")).toBe(true);
  expect(cut).not.toContain("  ");
  expect(truncateText("x".repeat(200), 20)).toBe(`${"x".repeat(19)}…`);
});

test("joinPresent skips empty parts", () => {
  expect(joinPresent(["Acme", null, " ", "Berlin"])).toBe("Acme · Berlin");
  expect(joinPresent([null])).toBe("");
});
