import type {
  CvCertification,
  CvData,
  CvEducation,
  CvExperience,
  CvExtraction,
  CvLanguage,
  CvOtherSection,
  CvProfile,
  CvProject,
  CvSkillGroup,
} from "@/server/domain/cv";

// A name with no letters or digits still needs a stable, non-empty id.
const FALLBACK_SLUG = "item";

function slugPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slug(parts: Array<string | null>): string {
  return parts
    .filter((part): part is string => part !== null)
    .map(slugPart)
    .filter((part) => part.length > 0)
    .join("-");
}

function uniqueSlug(base: string, used: Set<string>): string {
  const root = base.length > 0 ? base : FALLBACK_SLUG;
  if (!used.has(root)) {
    used.add(root);
    return root;
  }
  let suffix = 2;
  let candidate = `${root}-${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

// A stored CvData always has an id string. A blank string is the missing value.
function keptId(id: string): string | null {
  return id.trim().length === 0 ? null : id;
}

function copyProfile(profile: CvProfile): CvProfile {
  return {
    fullName: profile.fullName,
    headline: profile.headline,
    location: profile.location,
    summary: profile.summary,
    email: profile.email,
    phone: profile.phone,
    links: profile.links.map((link) => ({ label: link.label, url: link.url })),
  };
}

function toExperience(item: Omit<CvExperience, "id">, id: string): CvExperience {
  return {
    id,
    company: item.company,
    role: item.role,
    location: item.location,
    employmentType: item.employmentType,
    startDate: item.startDate,
    endDate: item.endDate,
    current: item.current,
    summary: item.summary,
    highlights: item.highlights.slice(),
    technologies: item.technologies.slice(),
  };
}

function toProject(item: Omit<CvProject, "id">, id: string): CvProject {
  return {
    id,
    name: item.name,
    role: item.role,
    url: item.url,
    startDate: item.startDate,
    endDate: item.endDate,
    summary: item.summary,
    highlights: item.highlights.slice(),
    technologies: item.technologies.slice(),
  };
}

function toEducation(item: Omit<CvEducation, "id">, id: string): CvEducation {
  return {
    id,
    institution: item.institution,
    degree: item.degree,
    field: item.field,
    startDate: item.startDate,
    endDate: item.endDate,
    details: item.details.slice(),
  };
}

function toSkillGroup(item: Omit<CvSkillGroup, "id">, id: string): CvSkillGroup {
  return {
    id,
    category: item.category,
    items: item.items.slice(),
  };
}

function toCertification(item: Omit<CvCertification, "id">, id: string): CvCertification {
  return {
    id,
    name: item.name,
    issuer: item.issuer,
    date: item.date,
    url: item.url,
  };
}

function toLanguage(item: Omit<CvLanguage, "id">, id: string): CvLanguage {
  return {
    id,
    name: item.name,
    proficiency: item.proficiency,
  };
}

function toOther(item: Omit<CvOtherSection, "id">, id: string): CvOtherSection {
  return {
    id,
    title: item.title,
    items: item.items.slice(),
  };
}

function assignAll<T, R extends { id: string }>(
  items: readonly T[],
  slugOf: (item: T) => string,
  copy: (item: T, id: string) => R,
): R[] {
  const used = new Set<string>();
  return items.map((item) => copy(item, uniqueSlug(slugOf(item), used)));
}

function ensureAll<T extends { id: string }>(
  items: readonly T[],
  slugOf: (item: T) => string,
  copy: (item: T, id: string) => T,
): T[] {
  const used = new Set<string>();
  for (const item of items) {
    const id = keptId(item.id);
    if (id !== null) used.add(id);
  }
  return items.map((item) => {
    const id = keptId(item.id);
    if (id !== null) return copy(item, id);
    return copy(item, uniqueSlug(slugOf(item), used));
  });
}

function experienceSlug(item: Pick<CvExperience, "company" | "role" | "startDate">): string {
  return slug([item.company, item.role, item.startDate]);
}

export function assignIds(extraction: CvExtraction): CvData {
  return {
    profile: copyProfile(extraction.profile),
    experience: assignAll(extraction.experience, experienceSlug, toExperience),
    projects: assignAll(extraction.projects, (item) => slug([item.name]), toProject),
    education: assignAll(
      extraction.education,
      (item) => slug([item.institution, item.degree]),
      toEducation,
    ),
    skills: assignAll(extraction.skills, (item) => slug([item.category]), toSkillGroup),
    certifications: assignAll(
      extraction.certifications,
      (item) => slug([item.name]),
      toCertification,
    ),
    languages: assignAll(extraction.languages, (item) => slug([item.name]), toLanguage),
    otherSections: assignAll(extraction.otherSections, (item) => slug([item.title]), toOther),
  };
}

export function ensureIds(data: CvData): CvData {
  return {
    profile: copyProfile(data.profile),
    experience: ensureAll(data.experience, experienceSlug, toExperience),
    projects: ensureAll(data.projects, (item) => slug([item.name]), toProject),
    education: ensureAll(
      data.education,
      (item) => slug([item.institution, item.degree]),
      toEducation,
    ),
    skills: ensureAll(data.skills, (item) => slug([item.category]), toSkillGroup),
    certifications: ensureAll(data.certifications, (item) => slug([item.name]), toCertification),
    languages: ensureAll(data.languages, (item) => slug([item.name]), toLanguage),
    otherSections: ensureAll(data.otherSections, (item) => slug([item.title]), toOther),
  };
}
