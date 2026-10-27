import { z } from "zod";

export const PRIMARY_ADMIN_EMAILS = [
  "team@edulearnx.ibi",
  "team@edulearnx.abdur",
  "abdur@admin.raheem",
] as const;
export const PRIMARY_ADMIN_EMAIL = PRIMARY_ADMIN_EMAILS[0];

export const ADMIN_FEATURES = [
  { key: "overview", label: "Dashboard overview" },
  { key: "users", label: "Students and teachers" },
  { key: "courses", label: "Courses" },
  { key: "liveClasses", label: "Live classes" },
  { key: "deals", label: "Deals and promo codes" },
  { key: "enrollmentRequests", label: "Enrollment requests" },
  { key: "tutorApplications", label: "Tutor applications" },
  { key: "settings", label: "Account settings" },
] as const;

export type AdminFeature = (typeof ADMIN_FEATURES)[number]["key"];
export type AdminPermissions = Record<AdminFeature, boolean>;

export const adminPermissionsSchema = z
  .object(
    Object.fromEntries(
      ADMIN_FEATURES.map(({ key }) => [key, z.boolean()]),
    ) as Record<AdminFeature, z.ZodBoolean>,
  )
  .strict();

export function normalizeAdminPermissions(value: unknown): AdminPermissions {
  const permissions =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return Object.fromEntries(
    ADMIN_FEATURES.map(({ key }) => [key, permissions[key] === true]),
  ) as AdminPermissions;
}

export const ALL_ADMIN_PERMISSIONS = normalizeAdminPermissions(
  Object.fromEntries(ADMIN_FEATURES.map(({ key }) => [key, true])),
);

export function isPrimaryAdmin(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return PRIMARY_ADMIN_EMAILS.some((ownerEmail) => ownerEmail === normalizedEmail);
}
