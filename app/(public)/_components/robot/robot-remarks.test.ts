import { expect, test } from "bun:test";

import {
  isRemarkSection,
  sectionRemarks,
} from "@/app/(public)/_components/robot/robot-remarks";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { CvData } from "@/server/domain/cv";

// A CV with the given number of roles, projects and skills (in two groups).
function cvWith(roles: number, projects: number, skills: number): CvData {
  const cv = structuredClone(sampleCv);
  cv.experience = Array.from({ length: roles }, (_, i) => ({ ...sampleCv.experience[0]!, id: `e${i}` }));
  cv.projects = Array.from({ length: projects }, (_, i) => ({ ...sampleCv.projects[0]!, id: `p${i}` }));
  const items = Array.from({ length: skills }, (_, i) => `Skill ${i}`);
  cv.skills = [
    { id: "s1", category: "A", items: items.slice(0, 1) },
    { id: "s2", category: "B", items: items.slice(1) },
  ];
  return cv;
}

test("each rendered section gets a line with its count, in page order", () => {
  expect(sectionRemarks(cvWith(3, 4, 24), "Lwin")).toEqual([
    {
      section: "experience",
      anchor: "experience",
      text: "Lwin has held 3 roles. Ask me about any of them.",
    },
    {
      section: "projects",
      anchor: "projects",
      text: "Lwin has built 4 projects. Open one for the full story.",
    },
    {
      section: "skills",
      anchor: "skills",
      text: "Lwin lists 24 skills. Ask me where Lwin has used them.",
    },
  ]);
});

test("a count of one reads in the singular", () => {
  expect(sectionRemarks(cvWith(1, 1, 1), "Lwin").map((remark) => remark.text)).toEqual([
    "Lwin has held 1 role. Ask me about it.",
    "Lwin has built 1 project. Open it for the full story.",
    "Lwin lists 1 skill. Ask me where Lwin has used it.",
  ]);
});

test("without the owner's name the lines name no one", () => {
  expect(sectionRemarks(cvWith(2, 3, 5), null).map((remark) => remark.text)).toEqual([
    "Here are 2 roles. Ask me about any of them.",
    "Here are 3 projects. Open one for the full story.",
    "Here are 5 skills. Ask me where they were used.",
  ]);
});

test("empty sections, and skill groups without items, get no line", () => {
  expect(sectionRemarks(cvWith(0, 2, 0), "Lwin").map((remark) => remark.section)).toEqual([
    "projects",
  ]);
  expect(sectionRemarks(cvWith(0, 0, 0), "Lwin")).toEqual([]);
});

test("isRemarkSection accepts only the three sections", () => {
  expect(isRemarkSection("projects")).toBe(true);
  expect(isRemarkSection("education")).toBe(false);
});
