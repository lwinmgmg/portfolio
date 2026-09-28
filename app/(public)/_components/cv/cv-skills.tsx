import { CvChips } from "@/app/(public)/_components/cv/cv-chips";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import type { CvSkillGroup } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.skills;

export function CvSkills({ groups }: { groups: readonly CvSkillGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <CvSection id={SECTION.id} title={SECTION.label}>
      <ul className="space-y-5">
        {groups.map((group) => (
          <li
            key={group.id}
            id={cvItemAnchor(SECTION.id, group.id)}
            data-cv-item
            className="grid scroll-mt-12 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6"
          >
            <h3 className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {group.category}
            </h3>
            <CvChips items={group.items} label={group.category} />
          </li>
        ))}
      </ul>
    </CvSection>
  );
}
