import type { RequestHandler } from "express";
import { query } from "../db/connection.js";

/**
 * Admin reporting built from the platform's existing enrolment, lesson-progress,
 * live-class and attendance records. No synthetic revenue or engagement values.
 */
export const getAdminAnalytics: RequestHandler = async (_req, res) => {
  try {
    const [teachers, students, attendance, alerts] = await Promise.all([
      query(`
        SELECT
          u.id,
          u.full_name AS teacher_name,
          COUNT(DISTINCT lc.id)::int AS total_classes,
          COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'completed')::int AS completed_classes,
          COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'active')::int AS active_classes,
          COUNT(DISTINCT a.id) FILTER (WHERE a.role = 'student')::int AS student_attendances,
          COALESCE(ROUND(AVG(a.duration_seconds) FILTER (WHERE a.role = 'student' AND a.duration_seconds > 0) / 60.0), 0)::int AS avg_student_minutes
        FROM users u
        LEFT JOIN live_classes lc ON lc.teacher_id = u.id
        LEFT JOIN live_class_attendance a ON a.live_class_id = lc.id
        WHERE u.role = 'teacher'
        GROUP BY u.id, u.full_name
        ORDER BY completed_classes DESC, student_attendances DESC, u.full_name ASC
      `),
      query(`
        SELECT
          u.id AS student_id,
          u.full_name AS student_name,
          u.email,
          c.id AS course_id,
          c.title AS course_title,
          e.enrolled_at,
          COALESCE(e.progress_percentage, 0)::numeric AS progress_percentage,
          COALESCE(e.is_completed, false) AS is_completed,
          COUNT(DISTINCT a.id) FILTER (WHERE a.role = 'student')::int AS classes_attended,
          MAX(a.joined_at) FILTER (WHERE a.role = 'student') AS last_class_attended
        FROM enrollments e
        JOIN users u ON u.id = e.student_id
        JOIN courses c ON c.id = e.course_id
        LEFT JOIN live_classes lc ON lc.course_id = c.id
        LEFT JOIN live_class_attendance a
          ON a.live_class_id = lc.id AND a.user_id = u.id
        WHERE u.role = 'student'
        GROUP BY u.id, u.full_name, u.email, c.id, c.title, e.enrolled_at, e.progress_percentage, e.is_completed
        ORDER BY progress_percentage ASC, e.enrolled_at ASC
        LIMIT 100
      `),
      query(`
        SELECT
          COUNT(DISTINCT lc.id)::int AS total_classes,
          COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'active')::int AS active_classes,
          COUNT(DISTINCT lc.id) FILTER (WHERE lc.status = 'completed')::int AS completed_classes,
          COUNT(DISTINCT a.id) FILTER (WHERE a.role = 'student')::int AS student_attendances,
          COUNT(DISTINCT a.user_id) FILTER (WHERE a.role = 'student')::int AS unique_students
        FROM live_classes lc
        LEFT JOIN live_class_attendance a ON a.live_class_id = lc.id
      `),
      query(`
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(e.progress_percentage, 0) < 25
              AND e.enrolled_at < CURRENT_TIMESTAMP - INTERVAL '14 days'
              AND COALESCE(e.is_completed, false) = false
          )::int AS low_progress_enrolments,
          COUNT(*) FILTER (
            WHERE lc.status = 'completed'
              AND lc.scheduled_end < CURRENT_TIMESTAMP - INTERVAL '7 days'
              AND NOT EXISTS (
                SELECT 1 FROM live_class_attendance a
                WHERE a.live_class_id = lc.id AND a.user_id = e.student_id AND a.role = 'student'
              )
          )::int AS missed_class_enrolments
        FROM enrollments e
        LEFT JOIN live_classes lc ON lc.course_id = e.course_id
      `),
    ]);

    const studentRows = students.rows;
    const attendanceRow = attendance.rows[0] ?? {};
    const alertRow = alerts.rows[0] ?? {};
    return res.json({
      success: true,
      data: {
        teachers: teachers.rows,
        students: studentRows,
        attendance: attendanceRow,
        alerts: {
          lowProgressEnrolments: Number(alertRow.low_progress_enrolments ?? 0),
          missedClassEnrolments: Number(alertRow.missed_class_enrolments ?? 0),
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin analytics query failed:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to load admin analytics. Check that the platform database migrations are current.",
    });
  }
};
