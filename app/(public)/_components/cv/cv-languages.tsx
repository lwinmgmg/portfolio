import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { mutedText } from "@/app/(public)/_components/cv/cv-styles";
import type { CvLanguage } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.languages;

export function CvLanguages({ items }: { items: readonly CvLanguage[] }) {
  if (items.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            id={cvItemAnchor(SECTION.id, item.id)}
            data-cv-item
            className="flex scroll-mt-12 items-baseline justify-between gap-4 border-b border-zinc-200 pb-2 dark:border-zinc-800"
          >
            <h3 className="font-medium text-zinc-950 dark:text-zinc-50">{item.name}</h3>
            {item.proficiency?.trim() ? <p className={mutedText}>{item.proficiency}</p> : null}
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
