import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_LOGIN_PATH } from "@/server/domain/auth";
import {
  EMAIL_ADMIN_PATH,
  GMAIL_CALLBACK_PATH,
  GMAIL_CONNECT_COOKIE,
  type ConnectFailure,
} from "@/server/email/gmail-oauth";
import { clearGmailConnectCookie, noStore } from "@/server/http/gmail-connect-cookie";
import { readSession } from "@/server/services/auth-service";
import { getEmail } from "@/server/services/email-runtime";

// Google's redirect back after the owner signs in. Saves the refresh token, then shows the result
// on the admin Email page.
export async function GET(request: NextRequest): Promise<Response> {
  if (!(await readSession())) {
    return noStore(NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url), 303));
  }

  let failure: ConnectFailure | null;
  try {
    const result = await getEmail().finishConnect({
      callbackUrl: request.nextUrl,
      cookie: request.cookies.get(GMAIL_CONNECT_COOKIE)?.value,
      // Must match the URI the connect route sent to Google exactly.
      redirectUri: new URL(GMAIL_CALLBACK_PATH, request.url).toString(),
    });
    failure = result.ok ? null : result.reason;
  } catch (error) {
    console.error("Could not connect Gmail.", error);
    failure = "failed";
  }

  const back = new URL(EMAIL_ADMIN_PATH, request.url);
  back.searchParams.set(failure ? "error" : "connected", failure ?? "1");
  const response = NextResponse.redirect(back, 303);
  clearGmailConnectCookie(response);
  return noStore(response);
}
