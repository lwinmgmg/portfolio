import { personJsonLd, serializeJsonLd } from "@/app/(public)/_components/cv/cv-seo";
import type { CvProfile } from "@/server/domain/cv";

// Structured data is not executable, so a plain <script> is right here, not next/script.
export function CvPersonJsonLd({ profile }: { profile: CvProfile }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd(profile)) }}
    />
  );
}
