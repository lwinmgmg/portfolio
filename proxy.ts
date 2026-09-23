import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminToken } from "@/server/auth/token-signer";
import {
  ADMIN_HOME_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_COOKIE,
} from "@/server/domain/auth";

// Optimistic redirect only. Pages and server actions call requireAdmin().
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminToken(token);
  const isLogin = pathname === ADMIN_LOGIN_PATH;

  if (isLogin && session) {
    return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
  }

  if (!isLogin && !session) {
    return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
