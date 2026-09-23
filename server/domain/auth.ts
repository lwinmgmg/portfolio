export const ADMIN_SUBJECT = "admin" as const;

export const ADMIN_SESSION_COOKIE = "admin_session";

export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

export const ADMIN_HOME_PATH = "/admin";

export const ADMIN_LOGIN_PATH = "/admin/login";

export const JWT_ISSUER = "portfolio";

export const JWT_AUDIENCE = "admin";

export type AdminSession = {
  subject: typeof ADMIN_SUBJECT;
  expiresAt: number;
};

export type AdminCredential = {
  username: string;
  passwordHash: string;
};
