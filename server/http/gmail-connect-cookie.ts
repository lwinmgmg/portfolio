import type { NextResponse } from "next/server";

import {
  GMAIL_CONNECT_COOKIE,
  GMAIL_CONNECT_COOKIE_PATH,
  GMAIL_CONNECT_SECONDS,
} from "@/server/email/gmail-oauth";

// Lax: Google's redirect back is a top-level GET, so the browser sends the cookie with it.
function options(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: GMAIL_CONNECT_COOKIE_PATH,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function setGmailConnectCookie(response: NextResponse, value: string): void {
  response.cookies.set(GMAIL_CONNECT_COOKIE, value, options(GMAIL_CONNECT_SECONDS));
}

export function clearGmailConnectCookie(response: NextResponse): void {
  response.cookies.set(GMAIL_CONNECT_COOKIE, "", options(0));
}

/** A redirect the browser must not cache: each one carries a one-time state. */
export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
