// Sends one fixed test email to CONTACT_EMAIL_TO through the Gmail sender (Plan.md 4.2). No database.
//   bun run email:test
import { EmailSendError } from "../server/domain/email";
import { parseEmailEnv } from "../server/email/email-env";
import { GmailEmailSender } from "../server/email/gmail-email-sender";

async function main(): Promise<void> {
  const parsed = parseEmailEnv();
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    console.error(`Email is not configured. Set or fix these in .env.local: ${names.join(", ")}.`);
    process.exit(1);
  }
  const env = parsed.data;
  const sentAt = new Date().toISOString();
  const sender = new GmailEmailSender(env);
  const { messageId } = await sender.send({
    to: env.CONTACT_EMAIL_TO,
    subject: "Portfolio chat: test email",
    text:
      "This is a test email from the portfolio's Gmail sender (bun run email:test).\n\n" +
      "If it arrived, the chat can send visitor messages to this address.\n\n" +
      `Sent at ${sentAt}`,
  });
  console.log(`Sent to ${env.CONTACT_EMAIL_TO}. Gmail message id: ${messageId}`);
}

main().catch((error: unknown) => {
  if (error instanceof EmailSendError) {
    console.error(`${error.message}${error.retryable ? " (safe to retry)" : ""}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
