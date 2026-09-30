import { expect, test } from "bun:test";

import {
  CHAT_NOTICES,
  INITIAL_CHAT_STATE,
  type AssistantEntry,
  type ChatState,
} from "@/app/(public)/_components/chat/chat-state";
import {
  ANSWER_PREVIEW_MAX_CHARS,
  answerPreview,
} from "@/app/(public)/_components/robot/robot-answer-preview";

function answer(text: string): AssistantEntry {
  return {
    id: "a1",
    role: "assistant",
    text,
    sources: null,
    status: "done",
    steps: [],
    reasoning: "",
    emailDraft: null,
    messageIndex: null,
    feedback: null,
  };
}

function chatWith(text: string): ChatState {
  return {
    ...INITIAL_CHAT_STATE,
    conversationId: "c1",
    entries: [{ id: "u1", role: "user", text: "Where?" }, answer(text)],
  };
}

test("a short answer is shown whole, as plain text without citations", () => {
  expect(answerPreview(chatWith("Lwin works at **Acme** [S1].\n\n- Go\n- *React* [S2, S3]"))).toBe(
    "Lwin works at Acme. Go React",
  );
  expect(answerPreview(chatWith("# Skills\nSee [the CV](https://example.com) and `bun`."))).toBe(
    "Skills See the CV and bun.",
  );
});

test("a long answer is cut at a word and ends with an ellipsis", () => {
  const long = `${"word ".repeat(60)}end`;
  const preview = answerPreview(chatWith(long));
  expect(preview.length).toBeLessThanOrEqual(ANSWER_PREVIEW_MAX_CHARS);
  expect(preview).toBe(`${"word ".repeat(30)}word…`);
});

test("a single long word is cut inside it", () => {
  const preview = answerPreview(chatWith("x".repeat(400)));
  expect(preview).toBe(`${"x".repeat(ANSWER_PREVIEW_MAX_CHARS - 1)}…`);
});

test("a notice wins over the answer", () => {
  expect(answerPreview({ ...chatWith("Partial"), notice: "interrupted" })).toBe(
    CHAT_NOTICES.interrupted,
  );
});

test("without answer text the bubble says the answer is ready", () => {
  expect(answerPreview(INITIAL_CHAT_STATE)).toBe("Your answer is ready.");
  expect(answerPreview(chatWith("[S1]"))).toBe("Your answer is ready.");
  expect(
    answerPreview({ ...INITIAL_CHAT_STATE, entries: [{ id: "u1", role: "user", text: "Hi" }] }),
  ).toBe("Your answer is ready.");
});
