import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { DatabaseConfigError, isDatabaseConfigured } from "@/server/db/client";
import { PUBLIC_SESSION_COOKIE } from "@/server/domain/public-session";
import { clientIpFromHeaders } from "@/server/http/client-ip";
import {
  publicCookieOptions,
  sessionMaxAge,
} from "@/server/http/public-session-cookie";
import { publicJson } from "@/server/http/public-json";
import { consumePublicSession } from "@/server/services/public-session-runtime";
import { PublicSessionRejected } from "@/server/services/public-session-service";

export type PublicSessionContext = { sessionId: string };

type OpenSession =
  | { ok: true; sessionId: string; sessionKey: string; expiresAt: Date }
  | { ok: false; response: NextResponse };

export function applyPublicSessionCookie(
  response: NextResponse,
  sessionKey: string,
  expiresAt: Date,
): NextResponse {
  response.cookies.set(
    PUBLIC_SESSION_COOKIE,
    sessionKey,
    publicCookieOptions(sessionMaxAge(expiresAt)),
  );
  response.headers.set("cache-control", "no-store");
  return response;
}

async function openPublicSession(request: Request): Promise<OpenSession> {
  if (!isDatabaseConfigured()) {
    return { ok: false, response: publicJson({ error: "unavailable" }, 503) };
  }

  const sessionKey = (await cookies()).get(PUBLIC_SESSION_COOKIE)?.value;
  if (!sessionKey) {
    return { ok: false, response: publicJson({ error: "session_invalid" }, 401) };
  }

  try {
    const rotated = await consumePublicSession(
      sessionKey,
      clientIpFromHeaders(request.headers),
    );
    return {
      ok: true,
      sessionId: rotated.sessionId,
      sessionKey: rotated.sessionKey,
      expiresAt: rotated.expiresAt,
    };
  } catch (error) {
    if (error instanceof PublicSessionRejected) {
      const exhausted = error.reason === "exhausted";
      return {
        ok: false,
        response: publicJson(
          { error: exhausted ? "session_exhausted" : "session_invalid" },
          exhausted ? 429 : 401,
        ),
      };
    }
    if (error instanceof DatabaseConfigError) {
      return { ok: false, response: publicJson({ error: "unavailable" }, 503) };
    }
    throw error;
  }
}

export async function withPublicSession(
  request: Request,
  produce: (session: PublicSessionContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const gate = await openPublicSession(request);
  if (!gate.ok) return gate.response;

  try {
    const response = await produce({ sessionId: gate.sessionId });
    return applyPublicSessionCookie(response, gate.sessionKey, gate.expiresAt);
  } catch (error) {
    const status = error instanceof DatabaseConfigError ? 503 : 500;
    return applyPublicSessionCookie(
      publicJson({ error: "unavailable" }, status),
      gate.sessionKey,
      gate.expiresAt,
    );
  }
}
