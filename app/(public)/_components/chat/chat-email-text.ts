import type { EmailDraftState } from "@/app/(public)/_components/chat/chat-state";

// The name comes from the CV, which an LLM extracted, so keep a runaway one off the button.
const MAX_FIRST_NAME_CHARS = 24;

// The first word of the CV's full name, for "Send to Lwin". A name written in capitals
// ("LWIN MAUNG MAUNG") is shown as "Lwin". Null when the CV has no name.
export function ownerFirstName(fullName: string): string | null {
  const [first] = fullName.trim().split(/\s+/);
  if (!first) return null;
  const word =
    first.length > 1 && first === first.toUpperCase() && first !== first.toLowerCase()
      ? first.charAt(0) + first.slice(1).toLowerCase()
      : first;
  return word.slice(0, MAX_FIRST_NAME_CHARS);
}

export function sendDraftLabel(ownerName: string | null): string {
  return ownerName ? `Send to ${ownerName}` : "Send";
}

// The line under the card once something happened to the draft. Null while it waits for Send.
export function draftResultText(state: EmailDraftState, ownerName: string | null): string | null {
  switch (state) {
    case "pending":
      return null;
    case "sending":
      return "Sending…";
    case "sent":
      return ownerName
        ? `Sent. ${ownerName} will reply to the address in your message.`
        : "Sent. You will get a reply at the address in your message.";
    case "failed":
      return "Could not send. Try again later.";
    case "limit":
      return "Limit reached for this session.";
    case "expired":
      return "This draft can no longer be sent. Ask for a new one.";
    case "discarded":
      return "Discarded.";
    case "superseded":
      return "Replaced by a newer draft.";
  }
}
