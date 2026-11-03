// Use the same completed-lesson calculation for enrollment cards and detail APIs.
// Identifiers passed here are internal SQL expressions, never request values.
export function courseProgressSql(student: string, course: string) {
  return `(SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE p.is_completed = true)
    / NULLIF(COUNT(*), 0), 2), 0)::float
    FROM course_modules m JOIN course_lessons l ON l.module_id=m.id
    LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.student_id=${student}
    WHERE m.course_id=${course})`;
}
