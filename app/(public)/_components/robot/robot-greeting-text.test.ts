import { expect, test } from "bun:test";

import {
  greetingLines,
  greetingTarget,
  shouldCloseOnScroll,
  type GreetingTarget,
} from "@/app/(public)/_components/robot/robot-greeting-text";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";

const PROJECTS: GreetingTarget = {
  section: "projects",
  anchor: "projects",
  label: "Show me the projects",
};

const EXPERIENCE: GreetingTarget = {
  section: "experience",
  anchor: "experience",
  label: "Show me the experience",
};

test("greetingTarget prefers projects, then experience, then nothing", () => {
  const cv = structuredClone(sampleCv);
  expect(greetingTarget(cv)).toEqual(PROJECTS);

  cv.projects = [];
  expect(greetingTarget(cv)).toEqual(EXPERIENCE);

  cv.experience = [];
  expect(greetingTarget(cv)).toBeNull();
});

test("the greeting names the robot and the owner and offers the target", () => {
  expect(greetingLines({ robotName: "Bit", ownerName: "Lwin", target: PROJECTS })).toEqual({
    opening: "Hi! I'm Bit, Lwin's assistant. Want to see what Lwin has built?",
    followUp: "Here are Lwin's projects. Open one for the full story, or ask me about it.",
  });
  expect(greetingLines({ robotName: "Bit", ownerName: "Lwin", target: EXPERIENCE })).toEqual({
    opening: "Hi! I'm Bit, Lwin's assistant. Want to see where Lwin has worked?",
    followUp: "Here is where Lwin has worked. Ask me about any role.",
  });
});

test("without a target the greeting offers only the chat", () => {
  expect(greetingLines({ robotName: "Bit", ownerName: "Lwin", target: null })).toEqual({
    opening: "Hi! I'm Bit, Lwin's assistant. Ask me anything about Lwin's work.",
    followUp: null,
  });
});

test("without the owner's name the greeting names no one", () => {
  expect(greetingLines({ robotName: "Bit", ownerName: null, target: PROJECTS })).toEqual({
    opening: "Hi! I'm Bit. I can show you around this CV.",
    followUp: "Here are the projects. Open one for the full story, or ask me about it.",
  });
  expect(greetingLines({ robotName: "Bit", ownerName: null, target: EXPERIENCE }).followUp).toBe(
    "Here is the work history. Ask me about any role.",
  );
  expect(greetingLines({ robotName: "Bit", ownerName: null, target: null })).toEqual({
    opening: "Hi! I'm Bit. Ask me anything about this CV.",
    followUp: null,
  });
});

test("the robot's name comes from the caller", () => {
  expect(greetingLines({ robotName: "Pip", ownerName: null, target: null }).opening).toBe(
    "Hi! I'm Pip. Ask me anything about this CV.",
  );
});

test("shouldCloseOnScroll closes after one screen height in either direction", () => {
  expect(shouldCloseOnScroll(100, 100, 700)).toBe(false);
  expect(shouldCloseOnScroll(100, 799, 700)).toBe(false);
  expect(shouldCloseOnScroll(100, 800, 700)).toBe(true);
  expect(shouldCloseOnScroll(900, 200, 700)).toBe(true);
  expect(shouldCloseOnScroll(900, 201, 700)).toBe(false);
  expect(shouldCloseOnScroll(0, 5_000, 0)).toBe(false);
});
