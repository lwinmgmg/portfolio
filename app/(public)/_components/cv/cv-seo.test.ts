import { expect, test } from "bun:test";

import {
  cvPageMeta,
  META_DESCRIPTION_MAX,
  personJsonLd,
  serializeJsonLd,
} from "@/app/(public)/_components/cv/cv-seo";
import { sampleCv } from "@/server/cv/__fixtures__/sample-cv";

test("cvPageMeta builds the title and a bounded description", () => {
  const profile = structuredClone(sampleCv.profile);
  expect(cvPageMeta(profile)).toEqual({
    title: "Jane Doe — Senior Software Engineer",
    description: "Builds reliable web products.",
  });

  profile.headline = " ";
  profile.summary = "word ".repeat(100);
  const meta = cvPageMeta(profile);
  expect(meta.title).toBe("Jane Doe");
  expect(meta.description?.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);

  profile.summary = null;
  expect(cvPageMeta(profile).description).toBeNull();
});

test("personJsonLd keeps only safe, unique links as sameAs", () => {
  const profile = structuredClone(sampleCv.profile);
  profile.links = [
    { label: "GitHub", url: "https://github.com/janedoe" },
    { label: "Again", url: "github.com/janedoe" },
    { label: "Bad", url: "javascript:alert(1)" },
  ];
  expect(personJsonLd(profile)).toEqual({
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Jane Doe",
    jobTitle: "Senior Software Engineer",
    sameAs: ["https://github.com/janedoe"],
  });

  profile.links = [];
  expect(personJsonLd(profile)).not.toHaveProperty("sameAs");
});

test("serializeJsonLd cannot close the script tag", () => {
  const profile = structuredClone(sampleCv.profile);
  profile.fullName = "</script><script>alert(1)</script>";
  const serialized = serializeJsonLd(personJsonLd(profile));
  expect(serialized).not.toContain("<");
  expect(JSON.parse(serialized).name).toBe(profile.fullName);
});
