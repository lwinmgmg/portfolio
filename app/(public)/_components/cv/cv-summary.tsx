import { CvSection } from "@/app/(public)/_components/cv/cv-section";
import { CV_SUMMARY_SECTION } from "@/app/(public)/_components/cv/cv-sections";

export function CvSummary({ summary }: { summary: string | null }) {
  const text = summary?.trim();
  if (!text) return null;
  return (
    <CvSection id={CV_SUMMARY_SECTION.id} title={CV_SUMMARY_SECTION.label}>
      <p className="whitespace-pre-line text-lg leading-8 text-zinc-700 dark:text-zinc-300">
        {text}
      </p>
    </CvSection>
  );
}
