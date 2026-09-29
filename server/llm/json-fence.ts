// Models sometimes wrap structured output in a markdown fence even when asked for JSON only.
export function unwrapJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?[^\n]*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
