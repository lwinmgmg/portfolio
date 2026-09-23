import "server-only";

import { parseAdminEnv } from "@/server/auth/admin-env";
import type { AdminCredential } from "@/server/domain/auth";

export interface AdminCredentialSource {
  get(): AdminCredential | null;
}

export class EnvAdminCredentialSource implements AdminCredentialSource {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  get(): AdminCredential | null {
    const admin = parseAdminEnv(this.env);
    if (!admin) return null;
    return {
      username: admin.ADMIN_USERNAME,
      passwordHash: admin.ADMIN_PASSWORD_HASH,
    };
  }
}
