import { listEntityKeys, renderCvEntity } from "@/server/cv/cv-markdown";
import type { CvData } from "@/server/domain/cv";
import type { ChunkDraft, Chunker, CorpusDocument } from "@/server/domain/rag";
import { entitySection } from "@/server/rag/chunking/cv-entity-spans";
import { outlineEntity, splitEntity } from "@/server/rag/chunking/entity-splitter";
import { estimateTokens } from "@/server/rag/chunking/estimate-tokens";

export type StructuredCvChunkerOptions = {
  // Larger entities are split into parts of at most this many tokens.
  maxEntityTokens?: number;
  // All skill groups become one chunk when their rendered total is at most this many tokens.
  // Null keeps one chunk per skill group.
  mergeSkillsMaxTokens?: number | null;
};

export const STRUCTURED_MAX_ENTITY_TOKENS = 350;
export const STRUCTURED_MERGE_SKILLS_MAX_TOKENS = 200;

const SKILLS_SECTION = "skills";
const SKILLS_TITLE = "Skills";

type ChunkBody = Omit<ChunkDraft, "ordinal" | "tokenCount">;

// One chunk per CV entity, so a hit maps straight to one entity and its page anchor.
export class StructuredCvChunker implements Chunker {
  private readonly maxEntityTokens: number;
  private readonly mergeSkillsMaxTokens: number | null;

  constructor(options: StructuredCvChunkerOptions = {}) {
    this.maxEntityTokens = options.maxEntityTokens ?? STRUCTURED_MAX_ENTITY_TOKENS;
    this.mergeSkillsMaxTokens =
      options.mergeSkillsMaxTokens === undefined
        ? STRUCTURED_MERGE_SKILLS_MAX_TOKENS
        : options.mergeSkillsMaxTokens;
    if (!Number.isInteger(this.maxEntityTokens) || this.maxEntityTokens < 1) {
      throw new RangeError("maxEntityTokens must be a positive integer.");
    }
    if (
      this.mergeSkillsMaxTokens !== null &&
      (!Number.isInteger(this.mergeSkillsMaxTokens) || this.mergeSkillsMaxTokens < 1)
    ) {
      throw new RangeError("mergeSkillsMaxTokens must be a positive integer or null.");
    }
  }

  chunk(doc: CorpusDocument): ChunkDraft[] {
    const keys = listEntityKeys(doc.data);
    const mergedSkills = this.mergeSkills(doc.data, keys);

    const bodies = keys.flatMap((entityKey): ChunkBody[] => {
      if (mergedSkills !== null && entitySection(entityKey) === SKILLS_SECTION) {
        // The merged chunk takes the place of the first skill group.
        return mergedSkills.entityKeys[0] === entityKey ? [mergedSkills] : [];
      }
      return this.entityChunks(doc.data, entityKey);
    });

    return bodies.map((body, ordinal) => ({
      ordinal,
      ...body,
      tokenCount: estimateTokens(body.text),
    }));
  }

  private entityChunks(data: CvData, entityKey: string): ChunkBody[] {
    const entity = outlineEntity(entityKey, renderCvEntity(data, entityKey));
    return splitEntity(entity, this.maxEntityTokens).map((text) => ({
      section: entitySection(entityKey),
      title: entity.title,
      entityKeys: [entityKey],
      text,
    }));
  }

  // The merged text is the skill renderings joined exactly as in the canonical markdown.
  private mergeSkills(data: CvData, keys: readonly string[]): ChunkBody | null {
    if (this.mergeSkillsMaxTokens === null) return null;
    const skillKeys = keys.filter((key) => entitySection(key) === SKILLS_SECTION);
    if (skillKeys.length < 2) return null;

    const text = skillKeys.map((key) => renderCvEntity(data, key)).join("\n\n");
    if (estimateTokens(text) > this.mergeSkillsMaxTokens) return null;
    return { section: SKILLS_SECTION, title: SKILLS_TITLE, entityKeys: skillKeys, text };
  }
}
