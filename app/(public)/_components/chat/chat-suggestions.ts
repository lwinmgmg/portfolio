import { truncateText } from "@/app/(public)/_components/cv/cv-format";
import type { CvData } from "@/server/domain/cv";

// Names come from the CV, which an LLM extracted, so keep a runaway one from filling the button.
const MAX_NAME_CHARS = 60;

// Starter questions for the empty chat: the latest role, the top skills and one project.
// Worded in the second person, like the "Ask about my experience" button.
export function chatSuggestions(cv: CvData): string[] {
  const questions = [roleQuestion(cv), skillsQuestion(cv), projectQuestion(cv)];
  return [...new Set(questions)];
}

function roleQuestion(cv: CvData): string {
  const latest = cv.experience.find((item) => item.current) ?? cv.experience[0];
  const company = name(latest?.company);
  if (company) return `What is your role at ${company}?`;
  const role = name(latest?.role);
  return role ? `What do you do as ${role}?` : "What is your current role?";
}

function skillsQuestion(cv: CvData): string {
  const top = cv.skills
    .flatMap((group) => group.items)
    .map(name)
    .filter((skill): skill is string => skill !== null)
    .slice(0, 2);
  if (top.length === 2) return `How have you used ${top[0]} and ${top[1]}?`;
  if (top.length === 1) return `How have you used ${top[0]}?`;
  return "What are your strongest skills?";
}

function projectQuestion(cv: CvData): string {
  const project = name(cv.projects[0]?.name);
  return project ? `Tell me about the ${project} project.` : "What have you built recently?";
}

function name(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? truncateText(trimmed, MAX_NAME_CHARS) : null;
}
