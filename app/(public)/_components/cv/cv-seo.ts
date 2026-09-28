import { safeWebUrl, truncateText } from "@/app/(public)/_components/cv/cv-format";
import type { CvProfile } from "@/server/domain/cv";

export const META_DESCRIPTION_MAX = 160;

export type CvPageMeta = { title: string; description: string | null };

export function cvPageMeta(profile: CvProfile): CvPageMeta {
  const name = profile.fullName.trim();
  const headline = profile.headline.trim();
  const summary = profile.summary?.trim();
  return {
    title: headline ? `${name} — ${headline}` : name,
    description: summary ? truncateText(summary, META_DESCRIPTION_MAX) : null,
  };
}

export type PersonJsonLd = {
  "@context": "https://schema.org";
  "@type": "Person";
  name: string;
  jobTitle?: string;
  sameAs?: string[];
};

export function personJsonLd(profile: CvProfile): PersonJsonLd {
  const sameAs = profile.links
    .map((link) => safeWebUrl(link.url))
    .filter((url): url is string => url !== null);
  const jobTitle = profile.headline.trim();
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.fullName.trim(),
    ...(jobTitle ? { jobTitle } : {}),
    ...(sameAs.length > 0 ? { sameAs: [...new Set(sameAs)] } : {}),
  };
}

// JSON.stringify does not escape "<", so a CV value containing "</script>" could
// close the tag. The unicode escape keeps the JSON identical for parsers.
export function serializeJsonLd(value: PersonJsonLd): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
