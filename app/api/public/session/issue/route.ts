import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { DatabaseConfigError, isDatabaseConfigured } from "@/server/db/client";
import {
  PUBLIC_SESSION_COOKIE,
  PUBLIC_SESSION_HOLD_COOKIE,
  PUBLIC_SESSION_HOLD_SECONDS,
  PUBLIC_SESSION_HOLD_VALUE,
} from "@/server/domain/public-session";
import { clientIpFromHeaders } from "@/server/http/client-ip";
import {
  publicCookieOptions,
  sessionMaxAge,
} from "@/server/http/public-session-cookie";
import { publicJson } from "@/server/http/public-json";
import { issuePublicSession } from "@/server/services/public-session-runtime";
import { PublicSessionLimited } from "@/server/services/public-session-service";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("next") !== "/") {
    return publicJson({ error: "invalid_next" }, 400);
  }

  if (request.cookies.get(PUBLIC_SESSION_COOKIE)?.value) {
    return redirectTo(request, "/");
  }

  if (!isDatabaseConfigured()) {
    return redirectHolding(request, "/?session=unavailable");
  }

  try {
    const issued = await issuePublicSession(clientIpFromHeaders(request.headers));
    const response = redirectTo(request, "/");
    response.cookies.set(
      PUBLIC_SESSION_COOKIE,
      issued.sessionKey,
      publicCookieOptions(sessionMaxAge(issued.expiresAt)),
    );
    return response;
  } catch (error) {
    if (error instanceof PublicSessionLimited) {
      return redirectHolding(request, "/?session=limited");
    }
    if (error instanceof DatabaseConfigError) {
      return redirectHolding(request, "/?session=unavailable");
    }
    throw error;
  }
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 307);
  response.headers.set("cache-control", "no-store");
  return response;
}

function redirectHolding(request: NextRequest, path: string): NextResponse {
  const response = redirectTo(request, path);
  response.cookies.set(
    PUBLIC_SESSION_HOLD_COOKIE,
    PUBLIC_SESSION_HOLD_VALUE,
    publicCookieOptions(PUBLIC_SESSION_HOLD_SECONDS),
  );
  return response;
}
