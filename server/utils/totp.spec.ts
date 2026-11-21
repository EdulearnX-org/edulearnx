import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpUri, verifyTotp } from "./totp.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function codeAt(secret: string, time: number) {
  let bits = "";
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map(value => parseInt(value, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

afterEach(() => vi.unstubAllEnvs());

describe("EduLearnX authenticator TOTP", () => {
  it("generates a standards-compatible 160-bit base32 secret", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("verifies six-digit time-based codes and tolerates one 30-second clock step", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    expect(verifyTotp(secret, codeAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, codeAt(secret, now), now + 30_000)).toBe(true);
    expect(verifyTotp(secret, "not-a-code", now)).toBe(false);
    expect(verifyTotp(secret, "999999", now)).toBe(false);
  });

  it("encrypts authenticator secrets with authenticated encryption and decrypts them", () => {
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "a".repeat(64));
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
    expect(encryptTotpSecret(secret)).not.toBe(encrypted);
    const parts = encrypted.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    expect(() => decryptTotpSecret(parts.join("."))).toThrow();
  });

  it("rejects encryption keys that are not 32 bytes", () => {
    vi.stubEnv("TOTP_ENCRYPTION_KEY", "short");
    expect(() => encryptTotpSecret(generateTotpSecret())).toThrow(/32-byte key/);
  });

  it("labels authenticator entries with the EduLearnX issuer and account role", () => {
    const uri = totpUri("ABCDEFGHIJKLMNOPQRSTUVWX234567AB", "student@example.com", "student");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("issuer=EduLearnX");
    expect(decodeURIComponent(uri)).toContain("EduLearnX:student (student@example.com)");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
