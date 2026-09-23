import { createHash, randomBytes } from "node:crypto";

export function createPublicSessionKey(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPublicSessionKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}
