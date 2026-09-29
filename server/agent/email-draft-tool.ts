import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { AgentTool, ToolContext, ToolOutcome } from "@/server/domain/agent";
import {
  EMAIL_DRAFT_MAX_CHARS,
  type ConversationRepository,
  type EmailDraft,
} from "@/server/domain/chat";

export const SEND_EMAIL_TOOL = "send_email";

export type EmailDraftArgs = { text: string };

// Every C0 and C1 control character except tab and newline. A lone CR goes, so CRLF becomes LF.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

const ArgsSchema = z.object({
  text: z
    .string()
    .transform((text) => text.replace(CONTROL_CHARACTERS, "").trim())
    .pipe(z.string().min(1).max(EMAIL_DRAFT_MAX_CHARS)),
});

const DESCRIPTION = [
  "Draft an email to the person this site is about, on the visitor's behalf.",
  "Use it only when the visitor asks to contact that person or to pass on a message.",
  "If the visitor has not given their name and a way to reply (an email address or a phone " +
    "number), ask for them first instead of calling this tool.",
  "Write the email in the first person, as the visitor, and include their name and contact details.",
  "The visitor sees the draft and must press Send, so never say that the message was sent.",
].join(" ");

// The model can only draft: the draft is stored as `pending` and sent later by the visitor's
// Send click, through its own endpoint, so a prompt injection cannot send mail by itself.
export class EmailDraftTool implements AgentTool<EmailDraftArgs> {
  readonly definition = {
    name: SEND_EMAIL_TOOL,
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "The whole email body in plain text, written as the visitor, with their name and " +
            "contact details.",
          minLength: 1,
          maxLength: EMAIL_DRAFT_MAX_CHARS,
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  };

  constructor(
    private readonly drafts: Pick<ConversationRepository, "addEmailDraft">,
    private readonly newId: () => string = () => randomUUID(),
  ) {}

  parse(args: unknown): EmailDraftArgs | null {
    const parsed = ArgsSchema.safeParse(args);
    return parsed.success ? { text: parsed.data.text } : null;
  }

  async run(args: EmailDraftArgs, context: ToolContext): Promise<ToolOutcome> {
    const draft: EmailDraft = {
      id: this.newId(),
      text: args.text,
      status: "pending",
      createdAt: context.now.toISOString(),
      sentAt: null,
    };
    await this.drafts.addEmailDraft(context.conversationId, draft);
    return {
      // The next round is asked without tool definitions, so the result repeats the one rule
      // that matters most.
      resultForModel: JSON.stringify({
        status: "draft_shown",
        note: "The visitor sees the draft with a Send button. Nothing has been sent.",
      }),
      event: { type: "email_draft", draft: { id: draft.id, text: draft.text } },
      outcome: "drafted",
      draftId: draft.id,
    };
  }
}
