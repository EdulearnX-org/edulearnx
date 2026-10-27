import { describe, expect, it } from "vitest";
import {
  adminPermissionsSchema,
  ADMIN_FEATURES,
  isPrimaryAdmin,
  normalizeAdminPermissions,
} from "./adminPermissions";

describe("admin permissions", () => {
  it("normalizes only known features with explicit true values", () => {
    const permissions = normalizeAdminPermissions({
      courses: true,
      liveClasses: true,
      users: 1,
      unknownFeature: true,
    });

    expect(permissions.courses).toBe(true);
    expect(permissions.liveClasses).toBe(true);
    expect(permissions.users).toBe(false);
    expect(Object.keys(permissions)).toHaveLength(ADMIN_FEATURES.length);
  });

  it("accepts a permission for every configured admin feature", () => {
    const permissions = Object.fromEntries(
      ADMIN_FEATURES.map(({ key }) => [key, true]),
    );

    expect(adminPermissionsSchema.parse(permissions)).toEqual(permissions);
    expect(() =>
      adminPermissionsSchema.parse({ ...permissions, unknown: true }),
    ).toThrow();
  });

  it("recognizes the primary admin email case-insensitively", () => {
    expect(isPrimaryAdmin(" Team@EduLearnX.ibi ")).toBe(true);
    expect(isPrimaryAdmin(" Team@EduLearnX.abdur ")).toBe(true);
    expect(isPrimaryAdmin(" Abdur@Admin.Raheem ")).toBe(true);
    expect(isPrimaryAdmin("someone@example.com")).toBe(false);
  });
});