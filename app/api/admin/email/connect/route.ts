import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_LOGIN_PATH } from "@/server/domain/auth";
import { EMAIL_ADMIN_PATH, GMAIL_CALLBACK_PATH } from "@/server/email/gmail-oauth";
import { noStore, setGmailConnectCookie } from "@/server/http/gmail-connect-cookie";
import { readSession } from "@/server/services/auth-service";
import { getEmail } from "@/server/services/email-runtime";

// Starts the owner's Gmail sign-in: remembers the state and PKCE verifier, then goes to Google.
export async function GET(request: NextRequest): Promise<Response> {
  if (!(await readSession())) {
    return noStore(NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url), 303));
  }
  const redirectUri = new URL(GMAIL_CALLBACK_PATH, request.url).toString();
  const start = getEmail().startConnect(redirectUri);
  if (!start) {
    const back = new URL(EMAIL_ADMIN_PATH, request.url);
    back.searchParams.set("error", "unconfigured");
    return noStore(NextResponse.redirect(back, 303));
  }
  const response = NextResponse.redirect(start.consentUrl, 303);
  setGmailConnectCookie(response, start.cookie);
  return noStore(response);
}
