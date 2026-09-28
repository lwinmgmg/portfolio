import type { ChatMessage } from "@/server/domain/llm";

export const CONTEXT_MAX_TOKENS = 150;

// Anthropic's contextual-retrieval prompt. The document part is identical for every chunk
// of a build and is marked cacheable, so the provider can reuse it across calls.
export function buildContextMessages(markdown: string, chunkText: string): ChatMessage[] {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: `<document>${markdown}</document>`, cacheControl: true },
        {
          type: "text",
          text:
            "Here is the chunk we want to situate within the whole document:\n" +
            `<chunk>${chunkText}</chunk>\n` +
            "Give a short succinct context (1–2 sentences, max 60 words) to situate this chunk " +
            "within the overall document for the purposes of improving search retrieval of the " +
            "chunk. Mention the person's name, the section, and the organization/time period " +
            "when relevant. Answer only with the succinct context and nothing else.",
        },
      ],
    },
  ];
}
