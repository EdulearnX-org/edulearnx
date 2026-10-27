import type { AuthUser } from "./authTypes.js";
import type { AdminFeature } from "../../shared/adminPermissions.js";
import { query } from "../db/connection.js";
import { hasAdminFeatureAccess } from "./adminPermissionMiddleware.js";

export async function canAccessStudentData(
  actor: AuthUser,
  studentId: number | string,
  courseId?: number | string,
  adminFeature: AdminFeature = "courses",
) {
  if (actor.role === "student" && String(actor.userId) === String(studentId)) {
    if (!courseId) return true;
    const enrollment = await query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2",
      [studentId, courseId],
    );
    return enrollment.rows.length > 0;
  }

  if (actor.role === "teacher" && courseId) {
    const assignment = await query(
      `SELECT c.id
       FROM courses c
       JOIN enrollments e ON e.course_id = c.id
       WHERE c.id = $1 AND c.instructor_id = $2 AND e.student_id = $3`,
      [courseId, actor.userId, studentId],
    );
    return assignment.rows.length > 0;
  }

  return (
    actor.role === "admin" &&
    (await hasAdminFeatureAccess(actor.userId, adminFeature))
  );
}

export async function canAccessCourse(
  actor: AuthUser,
  courseId: number | string,
  adminFeature: AdminFeature = "courses",
) {
  if (actor.role === "student") {
    const enrollment = await query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2",
      [actor.userId, courseId],
    );
    return enrollment.rows.length > 0 ? "enrolled" : "preview";
  }

  if (actor.role === "teacher") {
    const assignment = await query(
      "SELECT id FROM courses WHERE id = $1 AND instructor_id = $2",
      [courseId, actor.userId],
    );
    return assignment.rows.length > 0 ? "full" : false;
  }

  if (
    actor.role === "admin" &&
    (await hasAdminFeatureAccess(actor.userId, adminFeature))
  ) {
    return "full";
  }

  return false;
}
