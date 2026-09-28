import { CvBullets } from "@/app/(public)/_components/cv/cv-bullets";
import { CvChips } from "@/app/(public)/_components/cv/cv-chips";
import { formatDateRange, joinPresent } from "@/app/(public)/_components/cv/cv-format";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { bodyText, itemTitle, mutedText } from "@/app/(public)/_components/cv/cv-styles";
import type { CvExperience as CvExperienceItem } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.experience;

// Vertical timeline: a left rail with one accent dot per role.
export function CvExperience({ items }: { items: readonly CvExperienceItem[] }) {
  if (items.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ol className="ml-1.5 space-y-10 border-l border-zinc-200 dark:border-zinc-800">
        {items.map((item) => {
          const range = formatDateRange(item.startDate, item.endDate, item.current);
          const meta = joinPresent([item.company, item.location, item.employmentType]);
          return (
            <li
              key={item.id}
              id={cvItemAnchor(SECTION.id, item.id)}
              data-cv-item
              className="relative scroll-mt-12 pl-7"
            >
              <span
                aria-hidden="true"
                className="absolute -left-[5px] top-2 size-2.5 rounded-full bg-accent ring-4 ring-zinc-50 dark:ring-black print:ring-0"
              />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h3 className={itemTitle}>{item.role}</h3>
                {range ? <p className={`${mutedText} shrink-0 tabular-nums`}>{range}</p> : null}
              </div>
              {meta ? <p className={`mt-1 ${mutedText}`}>{meta}</p> : null}
              <div className="mt-4 space-y-4">
                {item.summary?.trim() ? <p className={bodyText}>{item.summary}</p> : null}
                <CvBullets items={item.highlights} />
                <CvChips items={item.technologies} label={`Technologies at ${item.company}`} />
              </div>
            </li>
          );
        })}
      </ol>
    </CvSection>
  );
}
