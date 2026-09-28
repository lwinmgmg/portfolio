// What is embedded and searched for a chunk: its context first, then the chunk itself.
export function composeIndexText(context: string | null, text: string): string {
  return context ? `${context}\n\n${text}` : text;
}
