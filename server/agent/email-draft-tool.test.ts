import { expect, test } from "bun:test";

import { EmailDraftTool, SEND_EMAIL_TOOL } from "@/server/agent/email-draft-tool";
import type { EmailDraft } from "@/server/domain/chat";

function setup() {
  const stored: { conversationId: string; draft: EmailDraft }[] = [];
  const tool = new EmailDraftTool(
    {
      addEmailDraft: async (conversationId, draft) => {
        stored.push({ conversationId, draft });
      },
    },
    () => "draft-1",
  );
  return { tool, stored };
}

const context = {
  conversationId: "conv-1",
  sessionId: "session-1",
  now: new Date("2026-09-29T12:00:00.000Z"),
};

test("the definition is send_email with one required text parameter", () => {
  const { tool } = setup();

  expect(tool.definition.name).toBe(SEND_EMAIL_TOOL);
  expect(tool.definition.parameters).toEqual({
    type: "object",
    properties: {
      text: {
        type: "string",
        description: tool.definition.parameters.properties.text.description,
        minLength: 1,
        maxLength: 2000,
      },
    },
    required: ["text"],
    additionalProperties: false,
  });
});

test("the description carries the drafting rules", () => {
  const { description } = setup().tool.definition;

  expect(description).toContain("only when the visitor asks to contact");
  expect(description).toContain("ask for them first instead of calling this tool");
  expect(description).toContain("first person");
  expect(description).toContain("never say that the message was sent");
});

test("parse trims the text and strips control characters but keeps newlines and tabs", () => {
  const { tool } = setup();

  expect(tool.parse({ text: "  Hi Lwin,\r\n\tI'm Jane.\u0007\u001b[31m\n\n" })).toEqual({
    text: "Hi Lwin,\n\tI'm Jane.[31m",
  });
});

test("parse accepts 1 to 2,000 characters after cleaning", () => {
  const { tool } = setup();

  expect(tool.parse({ text: "x".repeat(2000) })).toEqual({ text: "x".repeat(2000) });
  expect(tool.parse({ text: ` ${"x".repeat(2000)} ` })).toEqual({ text: "x".repeat(2000) });
  expect(tool.parse({ text: "x".repeat(2001) })).toBeNull();
  expect(tool.parse({ text: "  \u0000 \n " })).toBeNull();
});

test("parse rejects anything that is not an object with a text string", () => {
  const { tool } = setup();

  for (const args of [undefined, null, "Hi", { body: "Hi" }, { text: 42 }, [{ text: "Hi" }]]) {
    expect(tool.parse(args)).toBeNull();
  }
});

test("parse ignores extra arguments", () => {
  expect(setup().tool.parse({ text: "Hi", to: "attacker@example.com" })).toEqual({ text: "Hi" });
});

test("run stores a pending draft and returns the draft event and a result that says nothing was sent", async () => {
  const { tool, stored } = setup();

  const outcome = await tool.run({ text: "Hi Lwin, I'm Jane (jane@example.com)." }, context);

  expect(stored).toEqual([
    {
      conversationId: "conv-1",
      draft: {
        id: "draft-1",
        text: "Hi Lwin, I'm Jane (jane@example.com).",
        status: "pending",
        createdAt: "2026-09-29T12:00:00.000Z",
        sentAt: null,
      },
    },
  ]);
  expect(outcome.event).toEqual({
    type: "email_draft",
    draft: { id: "draft-1", text: "Hi Lwin, I'm Jane (jane@example.com)." },
  });
  expect(outcome.outcome).toBe("drafted");
  expect(outcome.draftId).toBe("draft-1");
  expect(JSON.parse(outcome.resultForModel)).toEqual({
    status: "draft_shown",
    note: "The visitor sees the draft with a Send button. Nothing has been sent.",
  });
});

test("run passes a storage failure on to the caller", async () => {
  const tool = new EmailDraftTool({
    addEmailDraft: async () => {
      throw new Error("database down");
    },
  });

  await expect(tool.run({ text: "Hi" }, context)).rejects.toMatchObject({ message: "database down" });
});
