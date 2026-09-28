import { expect, test } from "bun:test";

import {
  anchorForEntityKey,
  cvItemAnchor,
  cvNavItems,
  cvProjectPath,
} from "@/app/(public)/_components/cv/cv-sections";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";
import { listEntityKeys } from "@/server/cv/cv-markdown";

test("cvProjectPath points at the project page and escapes the id", () => {
  expect(cvProjectPath("portfolio")).toBe("/projects/portfolio");
  expect(cvProjectPath("a b/c")).toBe("/projects/a%20b%2Fc");
});

test("cvItemAnchor joins the section and item id", () => {
  expect(cvItemAnchor("experience", "acme-senior-engineer-2021")).toBe(
    "experience-acme-senior-engineer-2021",
  );
});

test("every entity key of a CV resolves to a unique anchor", () => {
  const anchors = listEntityKeys(sampleCv).map(anchorForEntityKey);
  expect(anchors).not.toContain(null);
  expect(new Set(anchors).size).toBe(anchors.length);
});

test("anchorForEntityKey maps prefixes to section ids", () => {
  expect(anchorForEntityKey("profile")).toBe("profile");
  expect(anchorForEntityKey("project:portfolio")).toBe("projects-portfolio");
  expect(anchorForEntityKey("certification:aws")).toBe("certifications-aws");
  expect(anchorForEntityKey("other:awards")).toBe("other-awards");
  expect(anchorForEntityKey("unknown:x")).toBeNull();
  expect(anchorForEntityKey("project:")).toBeNull();
  expect(anchorForEntityKey("project")).toBeNull();
});

test("cvNavItems lists only rendered sections in page order", () => {
  const data = structuredClone(sampleCv);
  data.certifications = [];
  const ids = cvNavItems(data).map((item) => item.id);
  expect(ids[0]).toBe("summary");
  expect(ids).not.toContain("certifications");
  expect(ids.indexOf("experience")).toBeLessThan(ids.indexOf("projects"));

  data.profile.summary = "  ";
  expect(cvNavItems(data).map((item) => item.id)).not.toContain("summary");
});
