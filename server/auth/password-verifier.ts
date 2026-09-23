import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Fixed cost. The encoded hash cannot select cheaper scrypt parameters.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;

export interface PasswordVerifier {
  verify(password: string, encodedHash: string): Promise<boolean>;
}

type ParsedHash = {
  salt: Buffer;
  hash: Buffer;
};

export class ScryptPasswordVerifier implements PasswordVerifier {
  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = parseHash(encodedHash);
    if (!parsed) return false;

    const derived = await deriveKey(password, parsed.salt);
    if (derived.length !== parsed.hash.length) return false;
    return timingSafeEqual(derived, parsed.hash);
  }
}

export function isWellFormedPasswordHash(encodedHash: string): boolean {
  return parseHash(encodedHash) !== null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await deriveKey(password, salt);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

// Next.js expands $NAME in env files. Escaping keeps the hash intact.
export function escapePasswordHashForEnv(encodedHash: string): string {
  return encodedHash.replaceAll("$", "\\$");
}

function parseHash(encodedHash: string): ParsedHash | null {
  const parts = encodedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return null;

  const salt = decodePart(parts[1], SCRYPT_SALT_BYTES);
  const hash = decodePart(parts[2], SCRYPT_KEYLEN);
  if (!salt || !hash) return null;
  return { salt, hash };
}

function decodePart(
  value: string | undefined,
  expectedBytes: number,
): Buffer | null {
  if (!value || value.length > 64) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== expectedBytes) return null;
  if (decoded.toString("base64") !== value) return null;
  return decoded;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
