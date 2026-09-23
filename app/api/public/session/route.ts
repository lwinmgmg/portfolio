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

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return publicJson({ error: "unavailable" }, 503);
  }

  try {
    const issued = await issuePublicSession(clientIpFromHeaders(request.headers));
    const response = new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
    response.cookies.set(
      PUBLIC_SESSION_COOKIE,
      issued.sessionKey,
      publicCookieOptions(sessionMaxAge(issued.expiresAt)),
    );
    return response;
  } catch (error) {
    if (error instanceof PublicSessionLimited) {
      const response = publicJson({ error: "issuance_limited" }, 429);
      response.cookies.set(
        PUBLIC_SESSION_HOLD_COOKIE,
        PUBLIC_SESSION_HOLD_VALUE,
        publicCookieOptions(PUBLIC_SESSION_HOLD_SECONDS),
      );
      return response;
    }
    if (error instanceof DatabaseConfigError) {
      return publicJson({ error: "unavailable" }, 503);
    }
    throw error;
  }
}
