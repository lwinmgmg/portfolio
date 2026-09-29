import { expect, test } from "bun:test";

import {
  EMAIL_DRAFT_TTL_MS,
  EMAIL_SEND_STUCK_MS,
  type Conversation,
  type EmailDraft,
  type EmailDraftStore,
} from "@/server/domain/chat";
import { EmailSendError, type OutgoingEmail } from "@/server/domain/email";
import {
  CONTACT_EMAIL_SUBJECT,
  ContactEmailService,
  contactEmailText,
  type ContactDraftRequest,
} from "@/server/services/contact-email-service";

const now = new Date("2026-09-30T10:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

type StoredDraft = EmailDraft & { claimedAt: Date | null };
type Row = Omit<Conversation, "emailDrafts"> & { emailDrafts: StoredDraft[] };

// Follows the Mongo repository's rules: the claim is atomic, matches only the session's newest
// pending draft younger than the TTL, and in-flight sends count toward the limits.
class MemoryDrafts implements EmailDraftStore {
  rows: Row[] = [];
  sentBefore = { session: 0, today: 0 };
  markFails = false;
  sinceQueries: Date[] = [];
  stuckSweeps: Date[] = [];

  conversation(id: string, sessionId: string, drafts: Partial<StoredDraft>[]): void {
    this.rows.push({
      id,
      sessionId,
      messages: [],
      emailDrafts: drafts.map((draft, index) => ({
        id: `d${index + 1}`,
        text: `Draft ${index + 1}`,
        status: "pending",
        createdAt: minutesAgo(5),
        sentAt: null,
        claimedAt: null,
        ...draft,
      })),
      createdAt: minutesAgo(10),
      updatedAt: minutesAgo(5),
    });
  }

  draft(conversationId: string, draftId: string): StoredDraft | undefined {
    return this.rows
      .find((row) => row.id === conversationId)
      ?.emailDrafts.find((draft) => draft.id === draftId);
  }

  async claimEmailDraft(
    conversationId: string,
    sessionId: string,
    draftId: string,
    at: Date,
  ): Promise<EmailDraft | null> {
    const row = this.rows.find((item) => item.id === conversationId && item.sessionId === sessionId);
    const newest = row?.emailDrafts.at(-1);
    if (
      !newest ||
      newest.id !== draftId ||
      newest.status !== "pending" ||
      Date.parse(newest.createdAt) <= at.getTime() - EMAIL_DRAFT_TTL_MS
    ) {
      return null;
    }
    newest.status = "sending";
    newest.claimedAt = at;
    return publicDraft(newest);
  }

  async markEmailDraft(
    conversationId: string,
    draftId: string,
    status: "sent" | "failed",
    at: Date,
  ): Promise<void> {
    if (this.markFails) throw new Error("database down");
    const draft = this.draft(conversationId, draftId);
    if (draft?.status !== "sending") return;
    draft.status = status;
    draft.sentAt = status === "sent" ? at.toISOString() : null;
  }

  async discardEmailDraft(conversationId: string, sessionId: string, draftId: string) {
    const row = this.rows.find((item) => item.id === conversationId && item.sessionId === sessionId);
    const draft = row?.emailDrafts.find((item) => item.id === draftId && item.status === "pending");
    if (!draft) return false;
    draft.status = "discarded";
    return true;
  }

  async countSentEmailsForSession(sessionId: string): Promise<number> {
    return (
      this.sentBefore.session +
      this.rows
        .filter((row) => row.sessionId === sessionId)
        .flatMap((row) => row.emailDrafts)
        .filter(countsAsSent).length
    );
  }

  async countSentEmailsSince(since: Date): Promise<number> {
    this.sinceQueries.push(since);
    return (
      this.sentBefore.today +
      this.rows
        .flatMap((row) => row.emailDrafts)
        .filter((draft) => countsAsSent(draft) && (draft.claimedAt?.getTime() ?? 0) >= since.getTime())
        .length
    );
  }

  async failEmailDraftsStuckSince(claimedBefore: Date): Promise<void> {
    this.stuckSweeps.push(claimedBefore);
    for (const draft of this.rows.flatMap((row) => row.emailDrafts)) {
      if (draft.status === "sending" && draft.claimedAt && draft.claimedAt < claimedBefore) {
        draft.status = "failed";
      }
    }
  }

  async findForSession(id: string, sessionId: string): Promise<Conversation | null> {
    const row = this.rows.find((item) => item.id === id && item.sessionId === sessionId);
    return row ? { ...row, emailDrafts: row.emailDrafts.map(publicDraft) } : null;
  }
}

function countsAsSent(draft: StoredDraft): boolean {
  return draft.status === "sent" || draft.status === "sending";
}

function publicDraft(draft: StoredDraft): EmailDraft {
  return {
    id: draft.id,
    text: draft.text,
    status: draft.status,
    createdAt: draft.createdAt,
    sentAt: draft.sentAt,
  };
}

type SetupOptions = {
  ready?: boolean;
  sendError?: unknown;
  sessionLimit?: number;
  dailyLimit?: number;
};

function setup(options: SetupOptions = {}) {
  const drafts = new MemoryDrafts();
  const sent: OutgoingEmail[] = [];
  const logged: string[] = [];
  const service = new ContactEmailService({
    drafts,
    outbox: async () =>
      options.ready === false
        ? null
        : {
            sender: {
              send: async (email) => {
                sent.push(email);
                if (options.sendError !== undefined) throw options.sendError;
                return { messageId: `gmail-${sent.length}` };
              },
            },
            to: "owner@example.com",
            sessionLimit: options.sessionLimit ?? 2,
            dailyLimit: options.dailyLimit ?? 20,
          },
    now: () => now,
    log: (message) => logged.push(message),
  });
  return { service, drafts, sent, logged };
}

const request: ContactDraftRequest = { sessionId: "s1", conversationId: "c1", draftId: "d1" };

test("send claims the draft, emails the owner and marks it sent", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s1", [{ text: "Hi Lwin, I'm Jane (jane@example.com)." }]);

  expect(await service.send(request)).toBe("sent");

  expect(sent).toEqual([
    {
      to: "owner@example.com",
      subject: CONTACT_EMAIL_SUBJECT,
      text:
        "Hi Lwin, I'm Jane (jane@example.com).\n\n--\n" +
        "Sent from the portfolio chat by a visitor. Reply to the contact details in the message above.\n" +
        "Conversation: c1\n" +
        "Sent at: 2026-09-30T10:00:00.000Z",
    },
  ]);
  expect(drafts.draft("c1", "d1")).toMatchObject({ status: "sent", sentAt: now.toISOString() });
  expect(drafts.sinceQueries).toEqual([new Date("2026-09-30T00:00:00.000Z")]);
  expect(drafts.stuckSweeps).toEqual([new Date(now.getTime() - EMAIL_SEND_STUCK_MS)]);
});

test("a second Send of the same draft gets not_found and sends nothing", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send(request)).toBe("sent");
  expect(await service.send(request)).toBe("not_found");

  expect(sent).toHaveLength(1);
});

test("two concurrent Sends of one draft send one email", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s1", [{}]);

  const results = await Promise.all([service.send(request), service.send(request)]);

  expect([...results].sort()).toEqual(["not_found", "sent"]);
  expect(sent).toHaveLength(1);
});

test("the session limit counts sent and in-flight drafts", async () => {
  const { service, drafts, sent } = setup({ sessionLimit: 2 });
  drafts.conversation("c0", "s1", [
    { status: "sent", claimedAt: now },
    { id: "d2", status: "sending", claimedAt: now },
  ]);
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send(request)).toBe("limit");

  expect(sent).toHaveLength(0);
  expect(drafts.draft("c1", "d1")?.status).toBe("pending");
});

test("another session's sends do not count toward this session's limit", async () => {
  const { service, drafts } = setup({ sessionLimit: 1 });
  drafts.conversation("c0", "s2", [{ status: "sent", claimedAt: now }]);
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send(request)).toBe("sent");
});

test("the daily limit is site-wide", async () => {
  const { service, drafts, sent } = setup({ dailyLimit: 3 });
  drafts.sentBefore.today = 3;
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send(request)).toBe("limit");
  expect(sent).toHaveLength(0);
});

test("a draft from another session is not found", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s2", [{}]);

  expect(await service.send(request)).toBe("not_found");
  expect(await service.discard(request)).toBe("not_found");

  expect(sent).toHaveLength(0);
  expect(drafts.draft("c1", "d1")?.status).toBe("pending");
});

test("a superseded draft is not found; only the newest can be sent", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s1", [{ status: "superseded" }, { id: "d2" }]);

  expect(await service.send(request)).toBe("not_found");
  expect(sent).toHaveLength(0);
});

test("a pending draft older than an hour is expired and stays unsent", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s1", [{ createdAt: minutesAgo(60) }]);

  expect(await service.send(request)).toBe("expired");

  expect(sent).toHaveLength(0);
  expect(drafts.draft("c1", "d1")?.status).toBe("pending");
});

test("an unknown conversation or draft is not found", async () => {
  const { service, drafts } = setup();
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send({ ...request, conversationId: "missing" })).toBe("not_found");
  expect(await service.send({ ...request, draftId: "missing" })).toBe("not_found");
});

test("a draft stuck in sending is marked failed and never resent", async () => {
  const { service, drafts, sent } = setup({ sessionLimit: 1 });
  drafts.conversation("c1", "s1", [
    { status: "sending", claimedAt: new Date(now.getTime() - EMAIL_SEND_STUCK_MS - 1) },
  ]);

  // The stuck send no longer holds the session's one place, but the draft itself is not sendable.
  expect(await service.send(request)).toBe("not_found");

  expect(sent).toHaveLength(0);
  expect(drafts.draft("c1", "d1")?.status).toBe("failed");
});

test("a provider failure marks the draft failed, logs, and gives only the code", async () => {
  const { service, drafts, logged } = setup({
    sendError: new EmailSendError("Gmail answered 500.", { status: 500, retryable: false }),
  });
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send(request)).toBe("failed");

  expect(drafts.draft("c1", "d1")?.status).toBe("failed");
  expect(logged).toEqual(["Contact email failed."]);
  // A failed draft cannot be sent again.
  expect(await service.send(request)).toBe("not_found");
});

test("a sent email stays sent when recording it fails", async () => {
  const { service, drafts, sent, logged } = setup();
  drafts.conversation("c1", "s1", [{}]);
  drafts.markFails = true;

  expect(await service.send(request)).toBe("sent");

  expect(sent).toHaveLength(1);
  expect(logged).toEqual(["Could not record the contact email as sent."]);
  expect(await service.send(request)).toBe("not_found");
});

test("send is unavailable without email settings or a Gmail connection", async () => {
  const { service, drafts, sent } = setup({ ready: false });
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.send(request)).toBe("unavailable");

  expect(sent).toHaveLength(0);
  expect(drafts.draft("c1", "d1")?.status).toBe("pending");
});

test("discard marks a pending draft discarded, once", async () => {
  const { service, drafts, sent } = setup();
  drafts.conversation("c1", "s1", [{}]);

  expect(await service.discard(request)).toBe("discarded");
  expect(await service.discard(request)).toBe("not_found");
  expect(await service.send(request)).toBe("not_found");

  expect(drafts.draft("c1", "d1")?.status).toBe("discarded");
  expect(sent).toHaveLength(0);
});

test("contactEmailText puts the footer after the draft", () => {
  const draft: EmailDraft = {
    id: "d1",
    text: "Hello",
    status: "sending",
    createdAt: now.toISOString(),
    sentAt: null,
  };

  expect(contactEmailText(draft, "c9", now).split("\n")).toEqual([
    "Hello",
    "",
    "--",
    "Sent from the portfolio chat by a visitor. Reply to the contact details in the message above.",
    "Conversation: c9",
    "Sent at: 2026-09-30T10:00:00.000Z",
  ]);
});
