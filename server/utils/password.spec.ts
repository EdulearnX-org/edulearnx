import {describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {hashPassword,verifyPassword,isLegacyHash,isValidPassword} from "./password.js";
describe("password storage",()=>{
 it("salts password hashes and verifies only the correct password",async()=>{
  const a=await hashPassword("correct-password");const b=await hashPassword("correct-password");
  expect(a).not.toEqual(b);expect(a).not.toContain("correct-password");
  expect(await verifyPassword("correct-password",a)).toBe(true);expect(await verifyPassword("wrong-password",a)).toBe(false);
 });
 it("accepts existing SHA256 hashes for upgrade, rejecting malformed hashes",async()=>{
  const hash=crypto.createHash("sha256").update("existing-password").digest("hex");
  expect(isLegacyHash(hash)).toBe(true);expect(await verifyPassword("existing-password",hash)).toBe(true);
  expect(await verifyPassword("incorrect",hash)).toBe(false);expect(await verifyPassword("anything","not-a-valid-hash")).toBe(false);
 });
 it("rejects inputs bcrypt would silently truncate, counting UTF-8 bytes",async()=>{
  expect(isValidPassword("😀".repeat(19))).toBe(false);expect(isValidPassword("a".repeat(72))).toBe(true);
  await expect(hashPassword("a".repeat(73))).rejects.toThrow("72");
 });
});
