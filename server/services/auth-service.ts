import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import {
  EnvAdminCredentialSource,
  type AdminCredentialSource,
} from "@/server/auth/admin-credential";
import { readJwtSecret } from "@/server/auth/admin-env";
import { credentialsMatch } from "@/server/auth/credentials";
import { LoginSchema, type LoginCredentials } from "@/server/auth/login-schema";
import {
  ScryptPasswordVerifier,
  type PasswordVerifier,
} from "@/server/auth/password-verifier";
import {
  CookieSessionStore,
  type SessionCookie,
} from "@/server/auth/session-cookie";
import { JoseTokenSigner, type TokenSigner } from "@/server/auth/token-signer";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_SECONDS,
  ADMIN_SUBJECT,
  type AdminSession,
} from "@/server/domain/auth";

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unconfigured" };

export class AuthService {
  constructor(
    private readonly credentials: AdminCredentialSource,
    private readonly passwords: PasswordVerifier,
    private readonly tokens: TokenSigner | null,
    private readonly sessions: SessionCookie,
  ) {}

  isConfigured(): boolean {
    return this.credentials.get() !== null && this.tokens !== null;
  }

  async login(input: unknown): Promise<LoginResult> {
    const admin = this.credentials.get();
    if (!admin || !this.tokens) return { ok: false, reason: "unconfigured" };

    const parsed = LoginSchema.safeParse(input);
    if (!parsed.success) return { ok: false, reason: "invalid" };

    const matched = await credentialsMatch(parsed.data, admin, this.passwords);
    if (!matched) return { ok: false, reason: "invalid" };

    const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
    const session: AdminSession = { subject: ADMIN_SUBJECT, expiresAt };
    const token = await this.tokens.sign(session);
    await this.sessions.write(token, expiresAt);
    return { ok: true };
  }

  async logout(): Promise<void> {
    await this.sessions.clear();
  }

  async readSession(): Promise<AdminSession | null> {
    if (!this.tokens) return null;
    const token = await this.sessions.read();
    if (!token) return null;
    return this.tokens.verify(token);
  }

  async requireAdmin(): Promise<AdminSession> {
    const session = await this.readSession();
    if (!session) redirect(ADMIN_LOGIN_PATH);
    return session;
  }
}

const secret = readJwtSecret();

const authService = new AuthService(
  new EnvAdminCredentialSource(),
  new ScryptPasswordVerifier(),
  secret ? new JoseTokenSigner(secret) : null,
  new CookieSessionStore(),
);

export function isAuthConfigured(): boolean {
  return authService.isConfigured();
}

export function login(credentials: LoginCredentials): Promise<LoginResult> {
  return authService.login(credentials);
}

export function logout(): Promise<void> {
  return authService.logout();
}

export const readSession = cache(() => authService.readSession());

export const requireAdmin = cache(() => authService.requireAdmin());

export function withAdmin<State>(
  action: (state: State, formData: FormData) => Promise<State>,
): (state: State, formData: FormData) => Promise<State> {
  return async (state, formData) => {
    await requireAdmin();
    return action(state, formData);
  };
}
