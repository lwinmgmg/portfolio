import "server-only";

import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE } from "@/server/domain/auth";

export interface SessionCookie {
  read(): Promise<string | null>;
  write(token: string, expiresAt: number): Promise<void>;
  clear(): Promise<void>;
}

export class CookieSessionStore implements SessionCookie {
  async read(): Promise<string | null> {
    const value = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
    return value ? value : null;
  }

  async write(token: string, expiresAt: number): Promise<void> {
    const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
    (await cookies()).set(ADMIN_SESSION_COOKIE, token, cookieOptions(maxAge));
  }

  async clear(): Promise<void> {
    (await cookies()).set(ADMIN_SESSION_COOKIE, "", cookieOptions(0));
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}
