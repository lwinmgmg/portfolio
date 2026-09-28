import { CvBullets } from "@/app/(public)/_components/cv/cv-bullets";
import { CvChips } from "@/app/(public)/_components/cv/cv-chips";
import { formatDateRange, joinPresent, safeWebUrl } from "@/app/(public)/_components/cv/cv-format";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { bodyText, itemTitle, mutedText, textLink } from "@/app/(public)/_components/cv/cv-styles";
import type { CvProject } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.projects;

export function CvProjects({ items }: { items: readonly CvProject[] }) {
  if (items.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => {
          const href = safeWebUrl(item.url);
          const meta = joinPresent([
            item.role,
            formatDateRange(item.startDate, item.endDate),
          ]);
          return (
            <li
              key={item.id}
              id={cvItemAnchor(SECTION.id, item.id)}
              data-cv-item
              className="flex scroll-mt-12 flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 print:border-black"
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
              {meta ? <p className={mutedText}>{meta}</p> : null}
              {item.summary.trim() ? <p className={`text-sm ${bodyText}`}>{item.summary}</p> : null}
              <div className="text-sm">
                <CvBullets items={item.highlights} />
              </div>
              <div className="mt-auto pt-1">
                <CvChips items={item.technologies} label={`Technologies in ${item.name}`} />
              </div>
            </li>
          );
        })}
      </ul>
    </CvSection>
  );
}
