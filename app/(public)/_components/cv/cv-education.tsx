import { CvBullets } from "@/app/(public)/_components/cv/cv-bullets";
import { formatDateRange, joinPresent } from "@/app/(public)/_components/cv/cv-format";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { itemTitle, mutedText } from "@/app/(public)/_components/cv/cv-styles";
import type { CvEducation as CvEducationItem } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.education;

export function CvEducation({ items }: { items: readonly CvEducationItem[] }) {
  if (items.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ul className="space-y-8">
        {items.map((item) => {
          const range = formatDateRange(item.startDate, item.endDate);
          const degree = joinPresent([item.degree, item.field], ", ");
          return (
            <li
              key={item.id}
              id={cvItemAnchor(SECTION.id, item.id)}
              data-cv-item
              className="scroll-mt-12"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h3 className={itemTitle}>{item.institution}</h3>
                {range ? <p className={`${mutedText} shrink-0 tabular-nums`}>{range}</p> : null}
              </div>
              {degree ? <p className={`mt-1 ${mutedText}`}>{degree}</p> : null}
              {item.details.length > 0 ? (
                <div className="mt-3">
                  <CvBullets items={item.details} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </CvSection>
  );
}
