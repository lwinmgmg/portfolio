import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { readJwtSecret } from "@/server/auth/admin-env";
import {
  ADMIN_SUBJECT,
  type AdminSession,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from "@/server/domain/auth";

// Imported by proxy.ts. Keep this module free of server-only and next/headers.
const MIN_SECRET_LENGTH = 32;

const AdminClaimsSchema = z.object({
  sub: z.literal(ADMIN_SUBJECT),
  exp: z.number().int(),
});

export interface TokenSigner {
  sign(session: AdminSession): Promise<string>;
  verify(token: string | undefined): Promise<AdminSession | null>;
}

export class JoseTokenSigner implements TokenSigner {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error("JWT secret must be at least 32 characters.");
    }
    this.key = new TextEncoder().encode(secret);
  }

  async sign(session: AdminSession): Promise<string> {
    if (session.subject !== ADMIN_SUBJECT) {
      throw new Error("Only the admin subject can be signed.");
    }

    const expiresAt = Math.floor(session.expiresAt);
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(ADMIN_SUBJECT)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
  }

  async verify(token: string | undefined): Promise<AdminSession | null> {
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: ADMIN_SUBJECT,
      });
      const claims = AdminClaimsSchema.safeParse({
        sub: payload.sub,
        exp: payload.exp,
      });
      if (!claims.success) return null;
      return { subject: ADMIN_SUBJECT, expiresAt: claims.data.exp };
    } catch {
      return null;
    }
  }
}

export async function verifyAdminToken(
  token: string | undefined,
  secret: string | undefined = readJwtSecret(),
): Promise<AdminSession | null> {
  if (!token || !secret) return null;
  return new JoseTokenSigner(secret).verify(token);
}
