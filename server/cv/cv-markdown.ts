import { DuplicateCvEntityKeyError } from "@/server/cv/cv-ids";
import type {
  CvCertification,
  CvData,
  CvEducation,
  CvExperience,
  CvLanguage,
  CvLink,
  CvOtherSection,
  CvProfile,
  CvProject,
  CvSkillGroup,
} from "@/server/domain/cv";

export class UnknownCvEntityError extends Error {
  readonly entityKey: string;

  constructor(entityKey: string) {
    super(`Unknown CV entity "${entityKey}".`);
    this.name = "UnknownCvEntityError";
    this.entityKey = entityKey;
  }
}

type EntityKind =
  | "experience"
  | "project"
  | "education"
  | "skills"
  | "certification"
  | "language"
  | "other";

function isEntityKind(value: string): value is EntityKind {
  return (
    value === "experience" ||
    value === "project" ||
    value === "education" ||
    value === "skills" ||
    value === "certification" ||
    value === "language" ||
    value === "other"
  );
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function factLines(lines: Array<string | null>): string | null {
  const presentLines = lines.filter((line): line is string => line !== null);
  if (presentLines.length === 0) return null;
  return presentLines.join("\n");
}

function renderBlocks(blocks: Array<string | null>): string {
  return blocks.filter((block): block is string => block !== null).join("\n\n");
}

function bulletList(label: string, items: readonly string[]): string | null {
  const lines = items.filter((item) => item.trim().length > 0).map((item) => `- ${item}`);
  if (lines.length === 0) return null;
  return `${label}:\n${lines.join("\n")}`;
}

function plainList(items: readonly string[]): string | null {
  const lines = items.filter((item) => item.trim().length > 0).map((item) => `- ${item}`);
  if (lines.length === 0) return null;
  return lines.join("\n");
}

function dateRange(start: string | null, end: string | null, current = false): string | null {
  const startText = present(start) ? start : null;
  const endText = current ? "Present" : present(end) ? end : null;
  if (startText && endText) return `${startText} – ${endText}`;
  return startText ?? endText;
}

function dateFact(start: string | null, end: string | null, current = false): string | null {
  const range = dateRange(start, end, current);
  return range === null ? null : `Dates: ${range}`;
}

function technologyLine(technologies: readonly string[]): string | null {
  const values = technologies.filter((item) => item.trim().length > 0);
  if (values.length === 0) return null;
  return `Technologies: ${values.join(", ")}`;
}

function formatLink(link: CvLink): string | null {
  const label = present(link.label) ? link.label : null;
  const url = present(link.url) ? link.url : null;
  if (label && url) return `- ${label}: ${url}`;
  if (label) return `- ${label}`;
  if (url) return `- ${url}`;
  return null;
}

function linkBlock(links: readonly CvLink[]): string | null {
  const lines = links.flatMap((link) => {
    const line = formatLink(link);
    return line === null ? [] : [line];
  });
  if (lines.length === 0) return null;
  return `Links:\n${lines.join("\n")}`;
}

function renderProfile(profile: CvProfile): string {
  return renderBlocks([
    `# ${profile.fullName}\n\n${profile.headline}`,
    factLines([
      present(profile.location) ? `Location: ${profile.location}` : null,
      present(profile.email) ? `Email: ${profile.email}` : null,
      present(profile.phone) ? `Phone: ${profile.phone}` : null,
      linkBlock(profile.links),
    ]),
    present(profile.summary) ? profile.summary : null,
  ]);
}

function renderSection(section: string, heading: string, body: Array<string | null>): string {
  return renderBlocks([`## ${section}`, `### ${heading}`, ...body]);
}

function renderExperience(item: CvExperience): string {
  return renderSection("Experience", `${item.role} at ${item.company}`, [
    factLines([
      `Company: ${item.company}`,
      `Role: ${item.role}`,
      present(item.location) ? `Location: ${item.location}` : null,
      present(item.employmentType) ? `Employment: ${item.employmentType}` : null,
      dateFact(item.startDate, item.endDate, item.current),
      `Current: ${item.current ? "yes" : "no"}`,
    ]),
    present(item.summary) ? item.summary : null,
    bulletList("Highlights", item.highlights),
    technologyLine(item.technologies),
  ]);
}

function renderProject(item: CvProject): string {
  return renderSection("Projects", item.name, [
    factLines([
      present(item.role) ? `Role: ${item.role}` : null,
      present(item.url) ? `URL: ${item.url}` : null,
      dateFact(item.startDate, item.endDate),
    ]),
    present(item.summary) ? item.summary : null,
    bulletList("Highlights", item.highlights),
    technologyLine(item.technologies),
  ]);
}

function educationHeading(item: CvEducation): string {
  if (present(item.degree)) return `${item.degree}, ${item.institution}`;
  return item.institution;
}

function renderEducation(item: CvEducation): string {
  return renderSection("Education", educationHeading(item), [
    factLines([
      present(item.field) ? `Field: ${item.field}` : null,
      dateFact(item.startDate, item.endDate),
    ]),
    bulletList("Details", item.details),
  ]);
}

function renderSkills(item: CvSkillGroup): string {
  return renderSection("Skills", item.category, [plainList(item.items)]);
}

function renderCertification(item: CvCertification): string {
  return renderSection("Certifications", item.name, [
    factLines([
      present(item.issuer) ? `Issuer: ${item.issuer}` : null,
      present(item.date) ? `Date: ${item.date}` : null,
      present(item.url) ? `URL: ${item.url}` : null,
    ]),
  ]);
}

function renderLanguage(item: CvLanguage): string {
  return renderSection("Languages", item.name, [
    present(item.proficiency) ? `Proficiency: ${item.proficiency}` : null,
  ]);
}

function renderOther(item: CvOtherSection): string {
  return renderSection("Other", item.title, [plainList(item.items)]);
}

function renderFound<T extends { id: string }>(
  items: readonly T[],
  id: string,
  entityKey: string,
  render: (item: T) => string,
): string {
  const matches = items.filter((candidate) => candidate.id === id);
  if (matches.length === 0) throw new UnknownCvEntityError(entityKey);
  if (matches.length > 1) throw new DuplicateCvEntityKeyError(entityKey);
  return render(matches[0]);
}

function renderKeyed(data: CvData, kind: EntityKind, id: string, entityKey: string): string {
  switch (kind) {
    case "experience":
      return renderFound(data.experience, id, entityKey, renderExperience);
    case "project":
      return renderFound(data.projects, id, entityKey, renderProject);
    case "education":
      return renderFound(data.education, id, entityKey, renderEducation);
    case "skills":
      return renderFound(data.skills, id, entityKey, renderSkills);
    case "certification":
      return renderFound(data.certifications, id, entityKey, renderCertification);
    case "language":
      return renderFound(data.languages, id, entityKey, renderLanguage);
    case "other":
      return renderFound(data.otherSections, id, entityKey, renderOther);
  }
}

export function listEntityKeys(data: CvData): string[] {
  const keys = [
    "profile",
    ...data.experience.map((item) => `experience:${item.id}`),
    ...data.projects.map((item) => `project:${item.id}`),
    ...data.education.map((item) => `education:${item.id}`),
    ...data.skills.map((item) => `skills:${item.id}`),
    ...data.certifications.map((item) => `certification:${item.id}`),
    ...data.languages.map((item) => `language:${item.id}`),
    ...data.otherSections.map((item) => `other:${item.id}`),
  ];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new DuplicateCvEntityKeyError(key);
    seen.add(key);
  }
  return keys;
}

export function renderCvEntity(data: CvData, entityKey: string): string {
  if (entityKey === "profile") return renderProfile(data.profile);
  const separator = entityKey.indexOf(":");
  const kind = separator === -1 ? "" : entityKey.slice(0, separator);
  const id = separator === -1 ? "" : entityKey.slice(separator + 1);
  if (!isEntityKind(kind) || id.length === 0) throw new UnknownCvEntityError(entityKey);
  return renderKeyed(data, kind, id, entityKey);
}

// Entity blocks stay intact inside the document so a chunker can find each one by exact text.
export function renderCvMarkdown(data: CvData): string {
  const markdown = listEntityKeys(data)
    .map((entityKey) => renderCvEntity(data, entityKey))
    .join("\n\n");
  return `${markdown}\n`;
}
