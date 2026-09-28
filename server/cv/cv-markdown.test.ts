import { expect, test } from "bun:test";

import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import { assignIds } from "@/server/cv/cv-ids";
import {
  UnknownCvEntityError,
  listEntityKeys,
  renderCvEntity,
  renderCvMarkdown,
} from "@/server/cv/cv-markdown";
import type { CvExtraction } from "@/server/domain/cv";

const sampleMarkdown = `# Jane Doe

Senior Software Engineer

Location: Berlin, Germany
Email: jane@example.com
Links:
- GitHub: https://github.com/janedoe

Builds reliable web products.

## Experience

### Senior Software Engineer at Acme

Company: Acme
Role: Senior Software Engineer
Location: Berlin
Employment: Full-time
Dates: 2021-04 – Present
Current: yes

Leads the platform team.

Highlights:
- Shipped the billing rewrite.
- Cut p95 latency by 30%.

Technologies: TypeScript, MongoDB

## Projects

### Portfolio

Role: Author
URL: https://jane.example
Dates: 2020 – 2020

Personal site.

Server-rendered CV with a chat assistant.

Built on the App Router.

Highlights:
- Designed the CV page.

Technologies: Next.js

## Education

### B.Sc. Computer Science, TU Berlin

Field: Computer Science
Dates: 2016 – 2019

Details:
- Thesis on search.

## Skills

### Languages

- TypeScript
- Go

## Certifications

### AWS Certified Developer

Issuer: Amazon
Date: 2022-06

## Languages

### English

Proficiency: Native

## Other

### Volunteering

- Mentor at a local code club.
`;

function emptyExtraction(): CvExtraction {
  return {
    profile: {
      fullName: "Ada Lovelace",
      headline: "Engineer",
      location: null,
      summary: null,
      email: null,
      phone: null,
      links: [],
    },
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    otherSections: [],
  };
}

test("renders the fixture as canonical markdown", () => {
  expect(renderCvMarkdown(sampleCv)).toBe(sampleMarkdown);
});

test("lists entity keys in document order", () => {
  expect(listEntityKeys(sampleCv)).toEqual([
    "profile",
    "experience:acme-senior-software-engineer-2021-04",
    "project:portfolio",
    "education:tu-berlin-b-sc-computer-science",
    "skills:languages",
    "certification:aws-certified-developer",
    "language:english",
    "other:volunteering",
  ]);
  expect(listEntityKeys(assignIds(emptyExtraction()))).toEqual(["profile"]);
});

test("embeds every entity inside the full markdown in document order", () => {
  const markdown = renderCvMarkdown(sampleCv);
  let offset = 0;
  for (const entityKey of listEntityKeys(sampleCv)) {
    const entity = renderCvEntity(sampleCv, entityKey);
    const found = markdown.indexOf(entity, offset);
    expect(entity.length).not.toBe(0);
    expect(found).not.toBe(-1);
    offset = found + entity.length;
  }
});

test("omits null fields from a single entity", () => {
  const data = assignIds({
    ...emptyExtraction(),
    education: [
      {
        institution: "MIT",
        degree: null,
        field: null,
        startDate: null,
        endDate: null,
        details: [],
      },
    ],
    certifications: [{ name: "First Aid", issuer: null, date: null, url: null }],
    languages: [{ name: "French", proficiency: null }],
  });

  expect(renderCvEntity(data, "education:mit")).toBe("## Education\n\n### MIT");
  expect(renderCvEntity(data, "certification:first-aid")).toBe(
    "## Certifications\n\n### First Aid",
  );
  expect(renderCvEntity(data, "language:french")).toBe("## Languages\n\n### French");
});

test("rejects an unknown entity key", () => {
  let caught: unknown;
  try {
    renderCvEntity(sampleCv, "experience:missing");
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof UnknownCvEntityError)) {
    throw new Error("Expected UnknownCvEntityError");
  }
  expect(caught.message).toBe('Unknown CV entity "experience:missing".');
  expect(() => renderCvEntity(sampleCv, "notes")).toThrow();
});

test("rejects duplicate entity keys instead of hiding the later item", () => {
  const data = {
    ...sampleCv,
    projects: [
      sampleCv.projects[0],
      { ...sampleCv.projects[0], name: "Second project", summary: "Unique second summary" },
    ],
  };

  expect(() => listEntityKeys(data)).toThrow();
  expect(() => renderCvEntity(data, "project:portfolio")).toThrow();
  expect(() => renderCvMarkdown(data)).toThrow();
});
