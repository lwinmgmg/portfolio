import Link from "next/link";

import { CvBullets } from "@/app/(public)/_components/cv/cv-bullets";
import { CvChips } from "@/app/(public)/_components/cv/cv-chips";
import {
  formatDateRange,
  joinPresent,
  safeWebUrl,
  toParagraphs,
} from "@/app/(public)/_components/cv/cv-format";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_LIST_SECTIONS, cvItemAnchor } from "@/app/(public)/_components/cv/cv-sections";
import { bodyText, mutedText, textLink } from "@/app/(public)/_components/cv/cv-styles";
import type { CvProfile, CvProject } from "@/server/domain/cv";

const SECTION = CV_LIST_SECTIONS.projects;

// A CV project on its own page: the card's content plus the long-form details.
export function CvProjectDetail({ project, profile }: { project: CvProject; profile: CvProfile }) {
  const href = safeWebUrl(project.url);
  const meta = joinPresent([project.role, formatDateRange(project.startDate, project.endDate)]);
  const paragraphs = toParagraphs(project.details);

  return (
    <article className="space-y-12">
      <header className="space-y-4">
        <Link
          href={`/#${cvItemAnchor(SECTION.id, project.id)}`}
          className={`${textLink} text-sm text-zinc-600 dark:text-zinc-400 print:hidden`}
        >
          ← Back to {profile.fullName.trim() || "the CV"}
        </Link>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-zinc-50">
          {project.name}
        </h1>
        {meta ? <p className={mutedText}>{meta}</p> : null}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={`${textLink} text-sm`}>
            Visit project ↗
          </a>
        ) : null}
      </header>

      {project.summary.trim() || paragraphs.length > 0 ? (
        <div className={`space-y-4 text-lg leading-relaxed ${bodyText}`}>
          {project.summary.trim() ? <p>{project.summary}</p> : null}
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line text-base">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}

      {project.highlights.length > 0 ? (
        <CvSection id="highlights" title="Highlights">
          <CvBullets items={project.highlights} />
        </CvSection>
      ) : null}

      {project.technologies.length > 0 ? (
        <CvSection id="technologies" title="Technologies">
          <CvChips items={project.technologies} label={`Technologies in ${project.name}`} />
        </CvSection>
      ) : null}
    </article>
  );
}
