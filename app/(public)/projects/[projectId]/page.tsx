import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CvProjectDetail } from "@/app/(public)/_components/cv/cv-project-detail";
import { projectPageMeta } from "@/app/(public)/_components/cv/cv-seo";
import { getPublishedProject } from "@/server/services/cv-runtime";

type ProjectPageProps = { params: Promise<{ projectId: string }> };

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const found = await getPublishedProject((await params).projectId);
  if (!found) return {};
  const { title, description } = projectPageMeta(found.project, found.profile);
  return description ? { title, description } : { title };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const found = await getPublishedProject((await params).projectId);
  if (!found) notFound();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black print:bg-white">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-24 print:max-w-none print:p-0">
        <CvProjectDetail project={found.project} profile={found.profile} />
      </main>
    </div>
  );
}
