import { renderCvMarkdown } from "@/server/cv/cv-markdown";
import type { CvProfile, CvVersionRepository } from "@/server/domain/cv";
import type { CorpusDocument, CorpusSource } from "@/server/domain/rag";

export function cvCorpusTitle(profile: CvProfile): string {
  const headline = profile.headline.trim();
  return headline.length > 0 ? `${profile.fullName} — ${headline}` : profile.fullName;
}

// The chat corpus is the published CV. Its version id is the source id, so an index records
// which CV it was built from.
export class CvCorpusSource implements CorpusSource {
  constructor(private readonly cvVersions: Pick<CvVersionRepository, "findPublished">) {}

  async load(): Promise<CorpusDocument | null> {
    const version = await this.cvVersions.findPublished();
    if (version === null || version.data === null) return null;
    return {
      sourceType: "cv",
      sourceId: version.id,
      title: cvCorpusTitle(version.data.profile),
      markdown: renderCvMarkdown(version.data),
      data: version.data,
    };
  }
}
