import { CvBullets } from "@/app/(public)/_components/cv/cv-bullets";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { itemTitle } from "@/app/(public)/_components/cv/cv-styles";
import type { CvOtherSection } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.otherSections;

// Sections the extractor could not classify, each with its own title.
export function CvOtherSections({ sections }: { sections: readonly CvOtherSection[] }) {
  if (sections.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ul className="space-y-8">
        {sections.map((section) => (
          <li
            key={section.id}
            id={cvItemAnchor(SECTION.id, section.id)}
            data-cv-item
            className="scroll-mt-12"
          >
            <h3 className={`mb-3 ${itemTitle}`}>{section.title}</h3>
            <CvBullets items={section.items} />
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
