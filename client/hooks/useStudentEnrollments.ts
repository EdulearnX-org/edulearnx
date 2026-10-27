import { useEffect, useState } from "react";

export type StudentEnrollment = {
  id: number;
  student_id: number | string;
  course_id: number | string;
  progress_percentage: number;
  is_completed: boolean;
  enrolled_at: string;
  completed_at: string | null;
  course_title: string;
  course_description: string | null;
  course_category: string | null;
  course_duration_weeks: number | null;
  course_start_date: string | null;
  course_end_date: string | null;
  course_thumbnail_url: string | null;
  instructor_name: string | null;
};

export function useStudentEnrollments(studentId?: number | string) {
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(studentId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) {
      setEnrollments([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadEnrollments = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/enrollments?student_id=${studentId}`);
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to fetch enrollments.");
        }

        if (isMounted) {
          setEnrollments(payload.data || []);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setEnrollments([]);
          setError(
            err instanceof Error ? err.message : "Unable to fetch enrollments.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadEnrollments();
    window.addEventListener("edulearnx-data-change", loadEnrollments);

    return () => {
      isMounted = false;
      window.removeEventListener("edulearnx-data-change", loadEnrollments);
    };
  }, [studentId]);

  return { enrollments, isLoading, error };
}
