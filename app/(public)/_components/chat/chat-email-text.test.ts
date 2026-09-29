import { expect, test } from "bun:test";

import {
  draftResultText,
  ownerFirstName,
  sendDraftLabel,
} from "@/app/(public)/_components/chat/chat-email-text";

test("ownerFirstName takes the first word and softens a name in capitals", () => {
  expect(ownerFirstName("LWIN MAUNG MAUNG")).toBe("Lwin");
  expect(ownerFirstName("  Jane   Doe ")).toBe("Jane");
  expect(ownerFirstName("McKenzie Smith")).toBe("McKenzie");
  expect(ownerFirstName("J. Doe")).toBe("J.");
  expect(ownerFirstName("李 小龙")).toBe("李");
  expect(ownerFirstName("   ")).toBeNull();
  expect(ownerFirstName("A".repeat(40))).toBe(`A${"a".repeat(23)}`);
});

test("the Send button names the owner when the CV has a name", () => {
  expect(sendDraftLabel("Lwin")).toBe("Send to Lwin");
  expect(sendDraftLabel(null)).toBe("Send");
});

test("the result line says what happened to the draft", () => {
  expect(draftResultText("pending", "Lwin")).toBeNull();
  expect(draftResultText("sending", "Lwin")).toBe("Sending…");
  expect(draftResultText("sent", "Lwin")).toBe(
    "Sent. Lwin will reply to the address in your message.",
  );
  expect(draftResultText("sent", null)).toBe(
    "Sent. You will get a reply at the address in your message.",
  );
  expect(draftResultText("failed", "Lwin")).toBe("Could not send. Try again later.");
  expect(draftResultText("limit", "Lwin")).toBe("Limit reached for this session.");
  expect(draftResultText("expired", "Lwin")).toBe(
    "This draft can no longer be sent. Ask for a new one.",
  );
  expect(draftResultText("discarded", "Lwin")).toBe("Discarded.");
  expect(draftResultText("superseded", "Lwin")).toBe("Replaced by a newer draft.");
});
