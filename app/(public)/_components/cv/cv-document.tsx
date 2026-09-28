import { CvCertifications } from "@/app/(public)/_components/cv/cv-certifications";
import { CvEducation } from "@/app/(public)/_components/cv/cv-education";
import { CvExperience } from "@/app/(public)/_components/cv/cv-experience";
import { CvHeader } from "@/app/(public)/_components/cv/cv-header";
import { CvLanguages } from "@/app/(public)/_components/cv/cv-languages";
import { CvOtherSections } from "@/app/(public)/_components/cv/cv-other-sections";
import { CvPersonJsonLd } from "@/app/(public)/_components/cv/cv-person-json-ld";
import { CvProjects } from "@/app/(public)/_components/cv/cv-projects";
import { CvSkills } from "@/app/(public)/_components/cv/cv-skills";
import { CvSummary } from "@/app/(public)/_components/cv/cv-summary";
import type { CvData } from "@/server/domain/cv";

// The published CV in page order. Keep this order in step with CV_LIST_SECTIONS,
// which drives the section nav.
export function CvDocument({ data }: { data: CvData }) {
  return (
    <>
      <CvPersonJsonLd profile={data.profile} />
      <CvHeader profile={data.profile} />
      <CvSummary summary={data.profile.summary} />
      <CvExperience items={data.experience} />
      <CvProjects items={data.projects} />
      <CvSkills groups={data.skills} />
      <CvEducation items={data.education} />
      <CvCertifications items={data.certifications} />
      <CvLanguages items={data.languages} />
      <CvOtherSections sections={data.otherSections} />
    </>
  );
}
