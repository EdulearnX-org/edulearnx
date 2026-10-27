import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const BCRYPT_ROUNDS = 12;
export const MAX_PASSWORD_BYTES = 72;

export function isValidPassword(password: string) {
  return password.length >= 8 && Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

export async function hashPassword(password: string): Promise<string> {
  // bcrypt silently truncates longer inputs, so enforce its byte limit explicitly.
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error("Password must not exceed 72 UTF-8 bytes.");
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Supports existing bcrypt and SHA256 hashes; upgrade SHA256 after successful login. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== "string") return false;
  if (storedHash.startsWith("$2")) {
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return false;
    return bcrypt.compare(password, storedHash);
  }
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, "hex");
  const actual = crypto.createHash("sha256").update(password).digest();
  return crypto.timingSafeEqual(actual, expected);
}

export function isLegacyHash(storedHash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(storedHash);
}
