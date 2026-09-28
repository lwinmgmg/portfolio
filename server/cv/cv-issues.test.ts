import { expect, test } from "bun:test";

import { cvFieldIssues, cvFieldMessage } from "@/server/cv/cv-issues";

test("cvFieldIssues joins zod paths with dots", () => {
  expect(
    cvFieldIssues([
      { path: ["experience", 0, "startDate"], message: "Invalid date" },
      { path: [], message: "Invalid CV" },
    ]),
  ).toEqual([
    { path: "experience.0.startDate", message: "Invalid date" },
    { path: "", message: "Invalid CV" },
  ]);
});

test("cvFieldMessage matches a field and its children", () => {
  const issues = [
    { path: "experience.0.highlights.1", message: "Too long" },
    { path: "profile.fullName", message: "Required" },
  ];

  expect(cvFieldMessage(issues, "experience.0.highlights")).toBe("Too long");
  expect(cvFieldMessage(issues, "profile.email")).toBeNull();
});
