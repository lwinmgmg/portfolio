import { expect, test } from "bun:test";

import { assignIds, DuplicateCvEntityKeyError, ensureIds } from "@/server/cv/cv-ids";
import type { CvData, CvExtraction } from "@/server/domain/cv";

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

function experience(
  company: string,
  role: string,
  startDate: string | null,
): CvExtraction["experience"][number] {
  return {
    company,
    role,
    location: null,
    employmentType: null,
    startDate,
    endDate: null,
    current: false,
    summary: null,
    highlights: ["Did the work."],
    technologies: ["Go"],
  };
}

function project(name: string): CvExtraction["projects"][number] {
  return {
    name,
    role: null,
    url: null,
    startDate: null,
    endDate: null,
    summary: "",
    highlights: [],
    technologies: [],
  };
}

test("builds a stable kebab slug for every section", () => {
  const extraction: CvExtraction = {
    ...emptyExtraction(),
    profile: {
      ...emptyExtraction().profile,
      links: [{ label: "Site", url: "https://example.com" }],
    },
    experience: [
      experience("Acme Corp", "Senior Engineer", "2021-04"),
      experience("Acme", "Engineer", null),
    ],
    projects: [project("Node.js")],
    education: [
      { institution: "MIT", degree: null, field: null, startDate: null, endDate: null, details: [] },
      {
        institution: "TU Berlin",
        degree: "B.Sc.",
        field: null,
        startDate: null,
        endDate: null,
        details: [],
      },
    ],
    skills: [{ category: "Languages & Tools", items: ["Go"] }],
    certifications: [{ name: "AWS Certified Developer", issuer: null, date: null, url: null }],
    languages: [{ name: "Español", proficiency: null }],
    otherSections: [{ title: "Open Source!", items: [] }],
  };

  const first = assignIds(extraction);
  const second = assignIds(extraction);

  expect(second).toEqual(first);
  expect(first.experience.map((item) => item.id)).toEqual([
    "acme-corp-senior-engineer-2021-04",
    "acme-engineer",
  ]);
  expect(first.projects[0].id).toBe("node-js");
  expect(first.education.map((item) => item.id)).toEqual(["mit", "tu-berlin-b-sc"]);
  expect(first.skills[0].id).toBe("languages-tools");
  expect(first.certifications[0].id).toBe("aws-certified-developer");
  expect(first.languages[0].id).toBe("espanol");
  expect(first.otherSections[0].id).toBe("open-source");
});

test("strips accents and punctuation", () => {
  const data = assignIds({
    ...emptyExtraction(),
    experience: [experience("École Polytechnique!", "Ingénieur — R&D", null)],
  });

  expect(data.experience[0].id).toBe("ecole-polytechnique-ingenieur-r-d");
});

test("suffixes duplicate slugs and skips a suffix that is already taken", () => {
  const duplicated = assignIds({
    ...emptyExtraction(),
    experience: [
      experience("Acme", "Engineer", "2020"),
      experience("Acme", "Engineer", "2020"),
      experience("Acme", "Engineer", "2020"),
    ],
  });
  expect(duplicated.experience.map((item) => item.id)).toEqual([
    "acme-engineer-2020",
    "acme-engineer-2020-2",
    "acme-engineer-2020-3",
  ]);

  const taken = assignIds({
    ...emptyExtraction(),
    projects: [project("Alpha"), project("Alpha 2"), project("Alpha")],
  });
  expect(taken.projects.map((item) => item.id)).toEqual(["alpha", "alpha-2", "alpha-3"]);
});

test("uses item when a name has no slug characters", () => {
  const data = assignIds({
    ...emptyExtraction(),
    experience: [experience("株式会社", "!!!", null), experience("@@@", "###", null)],
  });

  expect(data.experience.map((item) => item.id)).toEqual(["item", "item-2"]);
});

test("fills blank ids without changing or colliding with existing ones", () => {
  const assigned = assignIds({
    ...emptyExtraction(),
    experience: [experience("Acme", "Engineer", "2020"), experience("Acme", "Engineer", "2020")],
  });
  const edited: CvData = {
    ...assigned,
    experience: [
      { ...assigned.experience[0], id: "kept-id" },
      { ...assigned.experience[1], id: "" },
      { ...assigned.experience[0], id: "   " },
      { ...assigned.experience[0], id: "same" },
      { ...assigned.experience[0], id: "another" },
    ],
  };

  const result = ensureIds(edited);

  expect(result.experience.map((item) => item.id)).toEqual([
    "kept-id",
    "acme-engineer-2020",
    "acme-engineer-2020-2",
    "same",
    "another",
  ]);
  expect(edited.experience[1].id).toBe("");
  expect(edited.experience[2].id).toBe("   ");
});

test("rejects duplicate existing ids within a section", () => {
  const assigned = assignIds({
    ...emptyExtraction(),
    projects: [project("First"), project("Second")],
  });
  const edited: CvData = {
    ...assigned,
    projects: assigned.projects.map((item) => ({ ...item, id: "shared" })),
  };

  let caught: unknown;
  try {
    ensureIds(edited);
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof DuplicateCvEntityKeyError)) {
    throw new Error("Expected DuplicateCvEntityKeyError");
  }
  expect(caught.entityKey).toBe("project:shared");
  expect(edited.projects.map((item) => item.id)).toEqual(["shared", "shared"]);
});

test("does not mutate the input collections", () => {
  const extraction = {
    ...emptyExtraction(),
    experience: [experience("Acme", "Engineer", "2020")],
  };
  const assigned = assignIds(extraction);
  assigned.experience[0].highlights.push("changed");
  assigned.profile.links.push({ label: "X", url: "https://x.example" });
  expect(extraction.experience[0].highlights).toEqual(["Did the work."]);

  const withLink = assignIds({
    ...extraction,
    profile: {
      ...extraction.profile,
      links: [{ label: "Site", url: "https://example.com" }],
    },
  });
  const ensured = ensureIds(withLink);
  ensured.profile.links.push({ label: "X", url: "https://x.example" });
  ensured.experience[0].technologies.push("Rust");
  expect(withLink.profile.links).toEqual([{ label: "Site", url: "https://example.com" }]);
  expect(withLink.experience[0].technologies).toEqual(["Go"]);
});
