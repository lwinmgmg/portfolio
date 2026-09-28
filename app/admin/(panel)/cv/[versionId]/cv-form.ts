import type {
  CvCertification,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvLink,
  CvOtherSection,
  CvProject,
  CvSkillGroup,
} from "@/server/domain/cv";

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const current = next[index];
  const destination = next[target];
  if (current === undefined || destination === undefined) return [...items];
  next[index] = destination;
  next[target] = current;
  return next;
}

export function replaceAt<T>(items: readonly T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function emptyTextToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

export function createItemId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function emptyLink(): CvLink {
  return { label: "", url: "" };
}

export function emptyExperience(): CvExperience {
  return {
    id: createItemId("experience"),
    company: "",
    role: "",
    location: null,
    employmentType: null,
    startDate: null,
    endDate: null,
    current: false,
    summary: null,
    highlights: [],
    technologies: [],
  };
}

export function emptyProject(): CvProject {
  return {
    id: createItemId("project"),
    name: "",
    role: null,
    url: null,
    startDate: null,
    endDate: null,
    summary: "",
    details: null,
    highlights: [],
    technologies: [],
  };
}

export function emptyEducation(): CvEducation {
  return {
    id: createItemId("education"),
    institution: "",
    degree: null,
    field: null,
    startDate: null,
    endDate: null,
    details: [],
  };
}

export function emptySkillGroup(): CvSkillGroup {
  return {
    id: createItemId("skills"),
    category: "",
    items: [],
  };
}

export function emptyCertification(): CvCertification {
  return {
    id: createItemId("certification"),
    name: "",
    issuer: null,
    date: null,
    url: null,
  };
}

export function emptyLanguage(): CvLanguage {
  return {
    id: createItemId("language"),
    name: "",
    proficiency: null,
  };
}

export function emptyOtherSection(): CvOtherSection {
  return {
    id: createItemId("other"),
    title: "",
    items: [],
  };
}
