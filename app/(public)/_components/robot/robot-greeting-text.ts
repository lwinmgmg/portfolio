import { CV_LIST_SECTIONS } from "@/app/(public)/_components/cv/cv-sections";
import type { CvData } from "@/server/domain/cv";

// The section the greeting offers to show: the owner's work, or where they worked without any.
export type GreetingTarget = {
  section: "projects" | "experience";
  // The section's id on the page, for `href="#…"`.
  anchor: string;
  label: string;
};

export type GreetingLines = {
  opening: string;
  // After the target link is used. Null without a target.
  followUp: string | null;
};

export function greetingTarget(cv: CvData): GreetingTarget | null {
  if (cv.projects.length > 0) {
    return { section: "projects", anchor: CV_LIST_SECTIONS.projects.id, label: "Show me the projects" };
  }
  if (cv.experience.length > 0) {
    return {
      section: "experience",
      anchor: CV_LIST_SECTIONS.experience.id,
      label: "Show me the experience",
    };
  }
  return null;
}

export function greetingLines({
  robotName,
  ownerName,
  target,
}: {
  robotName: string;
  ownerName: string | null;
  target: GreetingTarget | null;
}): GreetingLines {
  return {
    opening: openingLine(robotName, ownerName, target),
    followUp: target ? followUpLine(ownerName, target) : null,
  };
}

function openingLine(robotName: string, ownerName: string | null, target: GreetingTarget | null) {
  if (!ownerName) {
    return target
      ? `Hi! I'm ${robotName}. I can show you around this CV.`
      : `Hi! I'm ${robotName}. Ask me anything about this CV.`;
  }
  const intro = `Hi! I'm ${robotName}, ${ownerName}'s assistant.`;
  if (!target) return `${intro} Ask me anything about ${ownerName}'s work.`;
  return target.section === "projects"
    ? `${intro} Want to see what ${ownerName} has built?`
    : `${intro} Want to see where ${ownerName} has worked?`;
}

function followUpLine(ownerName: string | null, target: GreetingTarget): string {
  if (target.section === "projects") {
    return `Here are ${ownerName ? `${ownerName}'s` : "the"} projects. Open one for the full story, or ask me about it.`;
  }
  return `Here is ${ownerName ? `where ${ownerName} has worked` : "the work history"}. Ask me about any role.`;
}

// On a phone the bubble sits over the CV text, so it goes once the visitor has scrolled a screen
// away from where it appeared (or from where the target link landed).
export function shouldCloseOnScroll(startY: number, y: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && Math.abs(y - startY) >= viewportHeight;
}
