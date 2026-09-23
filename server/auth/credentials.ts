import { createHash, timingSafeEqual } from "node:crypto";

import type { PasswordVerifier } from "@/server/auth/password-verifier";
import type { LoginCredentials } from "@/server/auth/login-schema";
import type { AdminCredential } from "@/server/domain/auth";

// Always hash the password, including when the username is wrong,
// so the two failures take the same amount of time.
export async function credentialsMatch(
  credentials: LoginCredentials,
  admin: AdminCredential,
  passwords: PasswordVerifier,
): Promise<boolean> {
  const usernameMatches = safeEqual(credentials.username, admin.username);
  const passwordMatches = await passwords.verify(
    credentials.password,
    admin.passwordHash,
  );
  return usernameMatches && passwordMatches;
}

function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}
