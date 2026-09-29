import { expect, test } from "bun:test";

import { chatSuggestions } from "@/app/(public)/_components/chat/chat-suggestions";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import type { CvData } from "@/server/domain/cv";

test("asks about the latest role, the top skills and a project", () => {
  expect(chatSuggestions(sampleCv)).toEqual([
    "What is your role at Acme?",
    "How have you used TypeScript and Go?",
    "Tell me about the Portfolio project.",
  ]);
});

test("prefers the current role over the first listed one", () => {
  const cv: CvData = structuredClone(sampleCv);
  const current = cv.experience[0];
  if (!current) throw new Error("fixture has no experience");
  cv.experience = [
    { ...current, id: "old", company: "Oldco", current: false },
    { ...current, id: "now", company: "Nowco", current: true },
  ];
  expect(chatSuggestions(cv)[0]).toBe("What is your role at Nowco?");
});

test("falls back to general questions when sections are empty", () => {
  const cv: CvData = { ...structuredClone(sampleCv), experience: [], skills: [], projects: [] };
  expect(chatSuggestions(cv)).toEqual([
    "What is your current role?",
    "What are your strongest skills?",
    "What have you built recently?",
  ]);
});

test("shortens a very long name", () => {
  const cv: CvData = structuredClone(sampleCv);
  const project = cv.projects[0];
  if (!project) throw new Error("fixture has no project");
  project.name = "word ".repeat(40);
  const question = chatSuggestions(cv)[2] ?? "";
  expect(question).toContain("…");
  expect(question.length).toBeLessThan(90);
});
