import { CV_LIST_SECTIONS } from "@/app/(public)/_components/cv/cv-sections";
import type { CvData } from "@/server/domain/cv";

export type RemarkSection = "experience" | "projects" | "skills";

// One line the robot says the first time the visitor reaches a section.
export type SectionRemark = {
  section: RemarkSection;
  // The section's id on the page, as the scroll spy reports it.
  anchor: string;
  text: string;
};

export const REMARK_SECTIONS: readonly RemarkSection[] = ["experience", "projects", "skills"];

// Only for sections the page renders. The counts repeat what is on the page, so the line is a
// nudge towards the chat, not new information.
export function sectionRemarks(cv: CvData, ownerName: string | null): SectionRemark[] {
  const remarks: SectionRemark[] = [];
  const roles = cv.experience.length;
  if (roles > 0) {
    remarks.push({
      section: "experience",
      anchor: CV_LIST_SECTIONS.experience.id,
      text: `${ownerName ? `${ownerName} has held` : "Here are"} ${count(roles, "role")}. ${
        roles === 1 ? "Ask me about it." : "Ask me about any of them."
      }`,
    });
  }
  const projects = cv.projects.length;
  if (projects > 0) {
    remarks.push({
      section: "projects",
      anchor: CV_LIST_SECTIONS.projects.id,
      text: `${ownerName ? `${ownerName} has built` : "Here are"} ${count(projects, "project")}. ${
        projects === 1 ? "Open it" : "Open one"
      } for the full story.`,
    });
  }
  const skills = cv.skills.reduce((total, group) => total + group.items.length, 0);
  if (skills > 0) {
    const them = skills === 1 ? "it" : "them";
    remarks.push({
      section: "skills",
      anchor: CV_LIST_SECTIONS.skills.id,
      text: ownerName
        ? `${ownerName} lists ${count(skills, "skill")}. Ask me where ${ownerName} has used ${them}.`
        : `Here are ${count(skills, "skill")}. Ask me where ${skills === 1 ? "it was" : "they were"} used.`,
    });
  }
  return remarks;
}

export function isRemarkSection(value: string): value is RemarkSection {
  return (REMARK_SECTIONS as readonly string[]).includes(value);
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
