import { z } from "zod";

import type { CvData, CvExtraction } from "@/server/domain/cv";

// Strict JSON-schema mode requires every key. Missing values are null, never omitted.
const YEAR_MONTH = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

const yearMonthSchema = z.string().regex(YEAR_MONTH);
const nullableYearMonth = yearMonthSchema.nullable();

// One entry per bullet. Surrounding whitespace and blank entries carry no content.
// `overwrite` keeps the type, so the JSON schema and the domain type are unchanged.
const lines = z
  .array(z.string())
  .overwrite((items) => items.map((item) => item.trim()).filter((item) => item.length > 0));

const linkSchema = z.strictObject({
  label: z.string(),
  url: z.string(),
});

const profileSchema = z.strictObject({
  fullName: z.string(),
  headline: z.string(),
  location: z.string().nullable(),
  summary: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  links: z.array(linkSchema),
});

const experienceFields = {
  company: z.string(),
  role: z.string(),
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  startDate: nullableYearMonth,
  endDate: nullableYearMonth,
  current: z.boolean(),
  summary: z.string().nullable(),
  highlights: lines,
  technologies: lines,
};

const projectFields = {
  name: z.string(),
  role: z.string().nullable(),
  url: z.string().nullable(),
  startDate: nullableYearMonth,
  endDate: nullableYearMonth,
  summary: z.string(),
  details: z.string().nullable(),
  highlights: lines,
  technologies: lines,
};

const educationFields = {
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  startDate: nullableYearMonth,
  endDate: nullableYearMonth,
  details: lines,
};

const skillFields = {
  category: z.string(),
  items: lines,
};

const certificationFields = {
  name: z.string(),
  issuer: z.string().nullable(),
  date: nullableYearMonth,
  url: z.string().nullable(),
};

const languageFields = {
  name: z.string(),
  proficiency: z.string().nullable(),
};

const otherFields = {
  title: z.string(),
  items: lines,
};

export const CvExtractionSchema = z.strictObject({
  profile: profileSchema,
  experience: z.array(z.strictObject(experienceFields)),
  projects: z.array(z.strictObject(projectFields)),
  education: z.array(z.strictObject(educationFields)),
  skills: z.array(z.strictObject(skillFields)),
  certifications: z.array(z.strictObject(certificationFields)),
  languages: z.array(z.strictObject(languageFields)),
  otherSections: z.array(z.strictObject(otherFields)),
});

export const CvDataSchema = z.strictObject({
  profile: profileSchema,
  experience: z.array(z.strictObject({ id: z.string(), ...experienceFields })),
  projects: z.array(z.strictObject({ id: z.string(), ...projectFields })),
  education: z.array(z.strictObject({ id: z.string(), ...educationFields })),
  skills: z.array(z.strictObject({ id: z.string(), ...skillFields })),
  certifications: z.array(z.strictObject({ id: z.string(), ...certificationFields })),
  languages: z.array(z.strictObject({ id: z.string(), ...languageFields })),
  otherSections: z.array(z.strictObject({ id: z.string(), ...otherFields })),
});

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

const schemasMatchDomain: [
  Equal<z.infer<typeof CvDataSchema>, CvData>,
  Equal<z.infer<typeof CvExtractionSchema>, CvExtraction>,
] = [true, true];

void schemasMatchDomain;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(parsed)) {
    throw new Error("CV extraction JSON schema must be an object.");
  }
  return parsed;
}

// Zod already emits strict objects for this schema. Reapply the rule so a zod
// change cannot drop `required` or `additionalProperties` before an extraction call.
function enforceStrictObjects(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) enforceStrictObjects(item);
    return;
  }
  if (!isRecord(node)) return;
  if (isRecord(node.properties)) {
    node.additionalProperties = false;
    node.required = Object.keys(node.properties);
  }
  for (const value of Object.values(node)) enforceStrictObjects(value);
}

export function cvExtractionJsonSchema(): Record<string, unknown> {
  const schema = cloneJsonObject(z.toJSONSchema(CvExtractionSchema));
  enforceStrictObjects(schema);
  return schema;
}
