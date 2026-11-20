import crypto from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let i = 0; i < bits.length; i += 5) encoded += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return encoded;
}

function decodeBase32(value: string) {
  const clean = value.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function verifyTotp(secret: string, token: string, now = Date.now()) {
  if (!/^\d{6}$/.test(token)) return false;
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  const supplied = Number(token);
  // Accept one 30-second step on either side to tolerate small clock drift.
  for (let drift = -1; drift <= 1; drift++) {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter + drift));
    const digest = crypto.createHmac("sha1", key).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
    if (binary % (10 ** DIGITS) === supplied) return true;
  }
  return false;
}

function encryptionKey() {
  const raw = process.env.TOTP_ENCRYPTION_KEY || "";
  const key = /^[A-Fa-f0-9]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.");
  return key;
}

export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTotpSecret(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted TOTP secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function totpUri(secret: string, email: string, role: string) {
  const label = encodeURIComponent(`EduLearnX:${role} (${email})`);
  const issuer = encodeURIComponent("EduLearnX");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
