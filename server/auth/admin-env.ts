import { z } from "zod";

import { isWellFormedPasswordHash } from "@/server/auth/password-verifier";

const MIN_SECRET_LENGTH = 32;

// Next.js turns \$ back into $ before these values reach the schema.
export const AdminEnvSchema = z.object({
  ADMIN_USERNAME: z.string().trim().min(1),
  ADMIN_PASSWORD_HASH: z.string().trim().refine(isWellFormedPasswordHash),
  JWT_SECRET: z.string().trim().min(MIN_SECRET_LENGTH),
});

export type AdminEnv = z.infer<typeof AdminEnvSchema>;

export function parseAdminEnv(
  env: NodeJS.ProcessEnv = process.env,
): AdminEnv | null {
  const parsed = AdminEnvSchema.safeParse({
    ADMIN_USERNAME: env.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: env.ADMIN_PASSWORD_HASH,
    JWT_SECRET: env.JWT_SECRET,
  });
  if (!parsed.success) return null;
  return parsed.data;
}

export function readJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return parseAdminEnv(env)?.JWT_SECRET;
}
