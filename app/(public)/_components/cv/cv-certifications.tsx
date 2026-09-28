import { formatYearMonth, joinPresent, safeWebUrl } from "@/app/(public)/_components/cv/cv-format";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { itemTitle, mutedText, textLink } from "@/app/(public)/_components/cv/cv-styles";
import type { CvCertification } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.certifications;

export function CvCertifications({ items }: { items: readonly CvCertification[] }) {
  if (items.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ul className="space-y-4">
        {items.map((item) => {
          const href = safeWebUrl(item.url);
          const meta = joinPresent([item.issuer, item.date ? formatYearMonth(item.date) : null]);
          return (
            <li
              key={item.id}
              id={cvItemAnchor(SECTION.id, item.id)}
              data-cv-item
              className="scroll-mt-12"
            >
              <h3 className={itemTitle}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className={textLink}>
                    {item.name}
                  </a>
                ) : (
                  item.name
                )}
              </h3>
              {meta ? <p className={`mt-0.5 ${mutedText}`}>{meta}</p> : null}
            </li>
          );
        })}
      </ul>
    </CvSection>
  );
}
