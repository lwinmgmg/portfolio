import type { Metadata } from "next";

import { CvComingSoon } from "@/app/(public)/_components/cv/cv-coming-soon";
import { CvDocument } from "@/app/(public)/_components/cv/cv-document";
import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CvSectionNav } from "@/app/(public)/_components/cv/cv-section-nav";
import { SIDE_PROJECTS_SECTION, cvNavItems } from "@/app/(public)/_components/cv/cv-sections";
import { cvPageMeta } from "@/app/(public)/_components/cv/cv-seo";
import { ProjectList } from "@/app/project-list";
import { readPublicSessionPresence } from "@/server/http/public-session-cookie";
import { getPublishedCv } from "@/server/services/cv-runtime";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata(): Promise<Metadata> {
  const cv = await getPublishedCv();
  if (!cv) return {};
  const { title, description } = cvPageMeta(cv.profile);
  return description ? { title, description } : { title };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[] }>;
}) {
  const sessionState = firstParam((await searchParams).session);
  const presence = await readPublicSessionPresence();
  const unavailable = sessionState === "unavailable";
  const limited = sessionState === "limited" || presence.onHold;
  const cv = await getPublishedCv();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black print:bg-white">
      <div
        className={`mx-auto w-full max-w-5xl flex-1 px-6 py-16 sm:py-24 print:max-w-none print:p-0 ${
          cv ? "lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-16" : ""
        }`}
      >
        {cv ? <CvSectionNav items={[...cvNavItems(cv), SIDE_PROJECTS_SECTION]} /> : null}
        <main className="mx-auto w-full max-w-3xl space-y-20 lg:mx-0">
          {cv ? <CvDocument data={cv} /> : <CvComingSoon />}
          <CvSection id={SIDE_PROJECTS_SECTION.id} title={SIDE_PROJECTS_SECTION.label}>
            <ProjectList
              issuanceBlocked={!presence.hasSession && limited}
              unavailable={unavailable}
            />
          </CvSection>
        </main>
      </div>
    </div>
  );
}
