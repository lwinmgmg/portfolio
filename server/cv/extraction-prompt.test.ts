import { expect, test } from "bun:test";

import { CV_EXTRACTION_PROMPT } from "@/server/cv/extraction-prompt";

test("extraction prompt forbids invention and fixes dates, technologies, and unknown sections", () => {
  expect(CV_EXTRACTION_PROMPT.includes("Never invent")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("Use null for missing nullable values.")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("Keep bullet wording verbatim.")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("YYYY-MM or YYYY")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("set endDate to null and current to true")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("role's technologies")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("otherSections")).toBe(true);
  expect(CV_EXTRACTION_PROMPT.includes("longer project description into details")).toBe(true);
});
