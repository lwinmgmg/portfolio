import "server-only";

import { parseEmailEnv } from "@/server/email/email-env";
import { GmailEmailSender } from "@/server/email/gmail-email-sender";
import { GoogleOAuthClient } from "@/server/email/google-oauth-client";
import { MongoGmailConnectionRepository } from "@/server/repositories/gmail-connection-repository";
import { EmailService } from "@/server/services/email-service";

let email: EmailService | null = null;

// Built on first use so a changed env is read after a restart, like the other runtimes.
export function getEmail(): EmailService {
  if (email) return email;
  const parsed = parseEmailEnv();
  const env = parsed.success ? parsed.data : null;
  email = new EmailService({
    env,
    missing: parsed.success
      ? []
      : [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))],
    oauth: env
      ? new GoogleOAuthClient({ clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET })
      : null,
    connections: new MongoGmailConnectionRepository(),
    createSender: (credentials) => new GmailEmailSender(credentials),
  });
  return email;
}
