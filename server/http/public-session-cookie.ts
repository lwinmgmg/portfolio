import "server-only";

import { cookies } from "next/headers";

import {
  PUBLIC_SESSION_COOKIE,
  PUBLIC_SESSION_HOLD_COOKIE,
} from "@/server/domain/public-session";

export function publicCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function sessionMaxAge(expiresAt: Date, now = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now) / 1000));
}

export async function readPublicSessionPresence(): Promise<{
  hasSession: boolean;
  onHold: boolean;
}> {
  const store = await cookies();
  return {
    hasSession: Boolean(store.get(PUBLIC_SESSION_COOKIE)?.value),
    onHold: Boolean(store.get(PUBLIC_SESSION_HOLD_COOKIE)?.value),
  };
}
