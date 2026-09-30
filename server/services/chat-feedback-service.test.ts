import { expect, test } from "bun:test";

import { ChatFeedbackService } from "@/server/services/chat-feedback-service";

test("a rating is saved when the store accepts it, and not_found otherwise", async () => {
  const calls: unknown[][] = [];
  const service = new ChatFeedbackService({
    setFeedback: async (...args) => {
      calls.push(args);
      return args[0] === "c1";
    },
  });

  expect(await service.rate({ sessionId: "s", conversationId: "c1", messageIndex: 1, value: "up" })).toBe(
    "saved",
  );
  expect(await service.rate({ sessionId: "s", conversationId: "c2", messageIndex: 1, value: "down" })).toBe(
    "not_found",
  );
  expect(calls[0]).toEqual(["c1", "s", 1, "up"]);
});
