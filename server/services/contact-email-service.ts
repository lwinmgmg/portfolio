import {
  EMAIL_DRAFT_TTL_MS,
  EMAIL_SEND_STUCK_MS,
  type EmailDraft,
  type EmailDraftStore,
} from "@/server/domain/chat";
import type { ContactOutbox } from "@/server/domain/email";
import { startOfUtcDay } from "@/server/services/chat-service";

type Log = (message: string, error?: unknown) => void;

export type ContactEmailServiceDeps = {
  drafts: EmailDraftStore;
  /** Null when the email env is missing or Gmail is not connected. */
  outbox: () => Promise<ContactOutbox | null>;
  now?: () => Date;
  log?: Log;
};

export type ContactDraftRequest = { sessionId: string; conversationId: string; draftId: string };

/** `unavailable`: email is not configured or Gmail is not connected. */
export type SendResult = "sent" | "limit" | "not_found" | "expired" | "failed" | "unavailable";

export type DiscardResult = "discarded" | "not_found";

export const CONTACT_EMAIL_SUBJECT = "Portfolio chat: message from a visitor";

/** Sends a chat draft to the owner on the visitor's Send click, at most once. */
export class ContactEmailService {
  private readonly now: () => Date;
  private readonly log: Log;

  constructor(private readonly deps: ContactEmailServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? ((message, error) => console.error(message, error));
  }

  async send(request: ContactDraftRequest): Promise<SendResult> {
    const outbox = await this.deps.outbox();
    if (!outbox) return "unavailable";
    const { drafts } = this.deps;
    const now = this.now();

    // A stuck `sending` draft would otherwise hold a place in the limits for good.
    await drafts.failEmailDraftsStuckSince(new Date(now.getTime() - EMAIL_SEND_STUCK_MS));
    const [forSession, today] = await Promise.all([
      drafts.countSentEmailsForSession(request.sessionId),
      drafts.countSentEmailsSince(startOfUtcDay(now)),
    ]);
    if (forSession >= outbox.sessionLimit || today >= outbox.dailyLimit) return "limit";

    const draft = await drafts.claimEmailDraft(
      request.conversationId,
      request.sessionId,
      request.draftId,
      now,
    );
    if (!draft) return this.whyNotClaimed(request, now);

    let result: "sent" | "failed";
    try {
      // No abort signal: once the request may have reached Gmail, stopping it would only hide
      // whether the email went out.
      await outbox.sender.send({
        to: outbox.to,
        subject: CONTACT_EMAIL_SUBJECT,
        text: contactEmailText(draft, request.conversationId, now),
      });
      result = "sent";
    } catch (error) {
      this.log("Contact email failed.", error);
      result = "failed";
    }

    // The email went out (or did not) whatever this write does, so its failure changes nothing
    // for the visitor. A draft left `sending` reads as `failed` later and is never resent.
    try {
      await drafts.markEmailDraft(request.conversationId, draft.id, result, this.now());
    } catch (error) {
      this.log(`Could not record the contact email as ${result}.`, error);
    }
    return result;
  }

  async discard(request: ContactDraftRequest): Promise<DiscardResult> {
    const discarded = await this.deps.drafts.discardEmailDraft(
      request.conversationId,
      request.sessionId,
      request.draftId,
    );
    return discarded ? "discarded" : "not_found";
  }

  // Only a pending draft that aged out is `expired`. A sent, superseded or another session's
  // draft is `not_found`, so a second Send learns nothing more than the first.
  private async whyNotClaimed(request: ContactDraftRequest, now: Date): Promise<SendResult> {
    const conversation = await this.deps.drafts.findForSession(
      request.conversationId,
      request.sessionId,
    );
    const draft = conversation?.emailDrafts.at(-1);
    if (draft?.id !== request.draftId || draft.status !== "pending") return "not_found";
    return now.getTime() - Date.parse(draft.createdAt) >= EMAIL_DRAFT_TTL_MS ? "expired" : "not_found";
  }
}

/** The draft, then a footer the visitor cannot change. */
export function contactEmailText(draft: EmailDraft, conversationId: string, sentAt: Date): string {
  return [
    draft.text,
    "",
    "--",
    "Sent from the portfolio chat by a visitor. Reply to the contact details in the message above.",
    `Conversation: ${conversationId}`,
    `Sent at: ${sentAt.toISOString()}`,
  ].join("\n");
}
