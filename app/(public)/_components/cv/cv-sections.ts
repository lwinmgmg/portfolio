import type { CvData } from "@/server/domain/cv";

// One registry for section anchors, nav labels and entity-key prefixes.
// Phase 2 citations resolve entity keys to these anchors, so ids here are public URLs.

export type CvNavItem = { id: string; label: string };

type ListSectionKey = Exclude<keyof CvData, "profile">;

type ListSection = {
  id: string;
  label: string;
  entityPrefix: string;
};

export const CV_PROFILE_ID = "profile";
export const CV_SUMMARY_SECTION: CvNavItem = { id: "summary", label: "Summary" };

// Declaration order is page order.
export const CV_LIST_SECTIONS = {
  experience: { id: "experience", label: "Experience", entityPrefix: "experience" },
  projects: { id: "projects", label: "Projects", entityPrefix: "project" },
  skills: { id: "skills", label: "Skills", entityPrefix: "skills" },
  education: { id: "education", label: "Education", entityPrefix: "education" },
  certifications: {
    id: "certifications",
    label: "Certifications",
    entityPrefix: "certification",
  },
  languages: { id: "languages", label: "Languages", entityPrefix: "language" },
  otherSections: { id: "other", label: "More", entityPrefix: "other" },
} as const satisfies Record<ListSectionKey, ListSection>;

const LIST_SECTION_KEYS = Object.keys(CV_LIST_SECTIONS) as ListSectionKey[];

export function cvItemAnchor(sectionId: string, itemId: string): string {
  return `${sectionId}-${itemId}`;
}

// "project:portfolio" -> "projects-portfolio". Unknown keys have no anchor.
export function anchorForEntityKey(entityKey: string): string | null {
  if (entityKey === "profile") return CV_PROFILE_ID;
  const separator = entityKey.indexOf(":");
  if (separator < 1) return null;
  const prefix = entityKey.slice(0, separator);
  const itemId = entityKey.slice(separator + 1);
  const section = LIST_SECTION_KEYS.map((key) => CV_LIST_SECTIONS[key]).find(
    (candidate) => candidate.entityPrefix === prefix,
  );
  return section && itemId ? cvItemAnchor(section.id, itemId) : null;
}

// Nav entries for the sections the page actually renders, in page order.
export function cvNavItems(data: CvData): CvNavItem[] {
  const items: CvNavItem[] = [];
  if (data.profile.summary?.trim()) items.push(CV_SUMMARY_SECTION);
  for (const key of LIST_SECTION_KEYS) {
    if (data[key].length > 0) {
      const { id, label } = CV_LIST_SECTIONS[key];
      items.push({ id, label });
    }
  }
  return items;
}
