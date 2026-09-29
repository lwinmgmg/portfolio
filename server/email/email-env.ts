import { z } from "zod";

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_SESSION_LIMIT = 2;

// Blank strings are unset, so defaults apply. A present invalid value fails.
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function required<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema);
}

function positiveIntWithDefault(fallback: number) {
  return z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(fallback));
}

export const EmailEnvSchema = z.object({
  GMAIL_CLIENT_ID: required(z.string().min(1)),
  GMAIL_CLIENT_SECRET: required(z.string().min(1)),
  CONTACT_EMAIL_TO: required(z.email()),
  CONTACT_EMAIL_DAILY_LIMIT: positiveIntWithDefault(DEFAULT_DAILY_LIMIT),
  CONTACT_EMAIL_SESSION_LIMIT: positiveIntWithDefault(DEFAULT_SESSION_LIMIT),
});

export type EmailEnv = z.infer<typeof EmailEnvSchema>;

export function parseEmailEnv(env: Record<string, string | undefined> = process.env) {
  return EmailEnvSchema.safeParse({
    GMAIL_CLIENT_ID: env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: env.GMAIL_CLIENT_SECRET,
    CONTACT_EMAIL_TO: env.CONTACT_EMAIL_TO,
    CONTACT_EMAIL_DAILY_LIMIT: env.CONTACT_EMAIL_DAILY_LIMIT,
    CONTACT_EMAIL_SESSION_LIMIT: env.CONTACT_EMAIL_SESSION_LIMIT,
  });
}

/**
 * Null when email is not configured (or configured wrongly): the email tool is then not offered.
 * The refresh token is not here; the owner connects Gmail on the admin Email page.
 */
export function readEmailEnv(
  env: Record<string, string | undefined> = process.env,
): EmailEnv | null {
  const parsed = parseEmailEnv(env);
  return parsed.success ? parsed.data : null;
}
