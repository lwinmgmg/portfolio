import type { Metadata } from "next";

import { chatSuggestions } from "@/app/(public)/_components/chat/chat-suggestions";
import { ChatWidget } from "@/app/(public)/_components/chat/chat-widget";
import { CvComingSoon } from "@/app/(public)/_components/cv/cv-coming-soon";
import { CvDocument } from "@/app/(public)/_components/cv/cv-document";
import { CvSectionNav } from "@/app/(public)/_components/cv/cv-section-nav";
import { cvNavItems } from "@/app/(public)/_components/cv/cv-sections";
import { cvPageMeta } from "@/app/(public)/_components/cv/cv-seo";
import { isChatAvailable } from "@/server/services/chat-runtime";
import { getPublishedCv } from "@/server/services/cv-runtime";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await getPublishedCv();
  if (!cv) return {};
  const { title, description } = cvPageMeta(cv.profile);
  return description ? { title, description } : { title };
}

export default async function HomePage() {
  const cv = await getPublishedCv();
  // The chat answers from the published CV's active index, so it needs both.
  const suggestions = cv && (await isChatAvailable()) ? chatSuggestions(cv) : null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black print:bg-white">
      <div
        className={`mx-auto w-full max-w-5xl flex-1 px-6 py-16 sm:py-24 print:max-w-none print:p-0 ${
          cv ? "lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-16" : ""
        }`}
      >
        {cv ? <CvSectionNav items={cvNavItems(cv)} /> : null}
        <main className="mx-auto w-full max-w-3xl space-y-20 lg:mx-0">
          {cv ? <CvDocument data={cv} /> : <CvComingSoon />}
        </main>
      </div>
      {suggestions ? <ChatWidget suggestions={suggestions} /> : null}
    </div>
  );
}
