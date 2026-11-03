import type { AuthUser } from "./authTypes.js";
import { hasAdminFeatureAccess } from "./adminPermissionMiddleware.js";

// All catalog consumers use the same visibility policy. Portal users retain
// access to their own draft/withdrawn courses without exposing other drafts.
export async function courseVisibility(actor: AuthUser | undefined) {
  if (actor?.role === "admin" && await hasAdminFeatureAccess(actor.userId, "courses")) return { sql: "TRUE", params: [] as unknown[] };
  if (actor?.role === "teacher") return { sql: "(c.is_published = true OR c.instructor_id = $1)", params: [actor.userId] };
  if (actor?.role === "student") return { sql: "(c.is_published = true OR EXISTS (SELECT 1 FROM enrollments visible_enrollment WHERE visible_enrollment.course_id = c.id AND visible_enrollment.student_id = $1))", params: [actor.userId] };
  return { sql: "c.is_published = true", params: [] as unknown[] };
}
