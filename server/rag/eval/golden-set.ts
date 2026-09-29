import { z } from "zod";

import type { ChatTurn } from "@/server/domain/chat";

const nonBlank = z.string().trim().min(1);

const ChatTurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: nonBlank,
}) satisfies z.ZodType<ChatTurn>;

// Strict, so a misspelled field fails instead of being ignored.
export const GoldenItemSchema = z.strictObject({
  id: nonBlank,
  question: nonBlank,
  // Earlier turns, oldest first, for follow-up questions.
  history: z.array(ChatTurnSchema).default([]),
  // A retrieved chunk is relevant when it carries any of these keys.
  relevantEntityKeys: z.array(nonBlank).min(1),
  tags: z.array(nonBlank).default([]),
});

export type GoldenItem = z.infer<typeof GoldenItemSchema>;

const GoldenSetSchema = z
  .array(GoldenItemSchema)
  .min(1)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate id "${item.id}".`,
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    });
  });

export class GoldenSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoldenSetError";
  }
}

export function parseGoldenSet(value: unknown): GoldenItem[] {
  const parsed = GoldenSetSchema.safeParse(value);
  if (!parsed.success) {
    throw new GoldenSetError(`Invalid golden set:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

// Items with any of `tags`. No tags selects every item.
export function selectByTags(items: readonly GoldenItem[], tags: readonly string[]): GoldenItem[] {
  if (tags.length === 0) return [...items];
  return items.filter((item) => item.tags.some((tag) => tags.includes(tag)));
}

export type UnknownKeys = { itemId: string; keys: string[] };

// Relevant keys that no chunk of the index carries: usually a typo, or a CV edit since the
// question was written. Such a key can never be retrieved, so it caps that item's recall.
export function unknownEntityKeys(
  items: readonly GoldenItem[],
  known: ReadonlySet<string>,
): UnknownKeys[] {
  return items.flatMap((item) => {
    const keys = item.relevantEntityKeys.filter((key) => !known.has(key));
    return keys.length > 0 ? [{ itemId: item.id, keys }] : [];
  });
}
