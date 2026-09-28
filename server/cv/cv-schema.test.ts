import { expect, test } from "bun:test";

import { sampleCv, sampleExtraction } from "@/server/cv/__fixtures__/sample-cv";
import { CvDataSchema, CvExtractionSchema, cvExtractionJsonSchema } from "@/server/cv/cv-schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eachObjectSchema(node: unknown, visit: (schema: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) eachObjectSchema(item, visit);
    return;
  }
  if (!isRecord(node)) return;
  if (isRecord(node.properties)) visit(node);
  for (const value of Object.values(node)) eachObjectSchema(value, visit);
}

test("accepts the fixture, including null fields and empty sections", () => {
  expect(CvExtractionSchema.safeParse(sampleExtraction).success).toBe(true);
  expect(CvDataSchema.safeParse(sampleCv).success).toBe(true);
  expect(
    CvExtractionSchema.safeParse({
      ...sampleExtraction,
      experience: [],
      projects: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      otherSections: [],
    }).success,
  ).toBe(true);
});

test("rejects an omitted nullable field and an unknown field", () => {
  const profile: Record<string, unknown> = { ...sampleExtraction.profile };
  delete profile.location;
  expect(CvExtractionSchema.safeParse({ ...sampleExtraction, profile }).success).toBe(false);
  expect(CvExtractionSchema.safeParse({ ...sampleExtraction, nickname: "JD" }).success).toBe(
    false,
  );
});

test("accepts a year or year-month and rejects any other date", () => {
  const parseStart = (startDate: string | null) => {
    const experience = [{ ...sampleExtraction.experience[0], startDate }];
    return CvExtractionSchema.safeParse({ ...sampleExtraction, experience }).success;
  };

  expect(parseStart("2020")).toBe(true);
  expect(parseStart("2020-01")).toBe(true);
  expect(parseStart("2020-12")).toBe(true);
  expect(parseStart(null)).toBe(true);
  expect(parseStart("2020-00")).toBe(false);
  expect(parseStart("2020-13")).toBe(false);
  expect(parseStart("2020-1")).toBe(false);
  expect(parseStart("2020-01-02")).toBe(false);
  expect(parseStart("")).toBe(false);
});

test("requires project details as a nullable string", () => {
  const withoutDetails: Record<string, unknown> = { ...sampleCv.projects[0] };
  delete withoutDetails.details;
  expect(CvDataSchema.safeParse({ ...sampleCv, projects: [withoutDetails] }).success).toBe(false);
  expect(
    CvDataSchema.safeParse({ ...sampleCv, projects: [{ ...sampleCv.projects[0], details: null }] })
      .success,
  ).toBe(true);
});

test("stores ids on saved data and keeps them off the extraction schema", () => {
  const experience: Record<string, unknown> = { ...sampleCv.experience[0] };
  delete experience.id;
  expect(CvDataSchema.safeParse({ ...sampleCv, experience: [experience] }).success).toBe(false);

  const blankId = structuredClone(sampleCv);
  blankId.experience[0].id = "";
  expect(CvDataSchema.safeParse(blankId).success).toBe(true);

  const withId = {
    ...sampleExtraction,
    experience: [{ ...sampleExtraction.experience[0], id: "custom" }],
  };
  expect(CvExtractionSchema.safeParse(withId).success).toBe(false);
});

test("emits a strict JSON schema whose objects require every property", () => {
  const schema = cvExtractionJsonSchema();
  let objectCount = 0;

  eachObjectSchema(schema, (objectSchema) => {
    objectCount += 1;
    const properties = objectSchema.properties;
    if (!isRecord(properties)) throw new Error("Expected object properties.");
    const required = objectSchema.required;
    if (!Array.isArray(required)) throw new Error("Expected a required list.");
    expect(objectSchema.additionalProperties).toBe(false);
    expect([...required].sort()).toEqual(Object.keys(properties).sort());
  });

  expect(objectCount).toBe(10);
  expect(JSON.stringify(schema).includes('"id"')).toBe(false);
});

test("trims list entries and drops blank ones without changing the JSON schema", () => {
  const input = structuredClone(sampleCv);
  const experience = input.experience[0];
  if (!experience) throw new Error("fixture");
  experience.technologies = ["  TypeScript ", "", "   ", "Go"];

  const parsed = CvDataSchema.parse(input);

  expect(parsed.experience[0]?.technologies).toEqual(["TypeScript", "Go"]);
  const highlights = ["properties", "experience", "items", "properties", "highlights"].reduce<unknown>(
    (node, key) => (isRecord(node) ? node[key] : undefined),
    cvExtractionJsonSchema(),
  );
  expect(highlights).toEqual({ type: "array", items: { type: "string" } });
});
