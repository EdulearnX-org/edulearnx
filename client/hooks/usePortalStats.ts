import { useEffect, useState } from "react";
import { readApiResponse } from "@/lib/api";
import { preloadCourses } from "@/hooks/useCourses";

export type PlatformStats = {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  totalEnrollments: number;
  pendingEnrollmentRequests: number;
  revenue: number;
};

const emptyStats: PlatformStats = {
  totalStudents: 0,
  totalTeachers: 0,
  totalCourses: 0,
  totalEnrollments: 0,
  pendingEnrollmentRequests: 0,
  revenue: 0,
};

export function usePortalStats() {
  const [stats, setStats] = useState(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadStats = async () => {
      try {
        setIsLoading(true);
        await preloadCourses();
        const response = await fetch("/api/platform-stats");
        const payload = await readApiResponse(response);

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to fetch platform stats.");
        }

        if (isMounted) {
          setStats({ ...emptyStats, ...payload.data });
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setStats(emptyStats);
          setError(
            err instanceof Error ? err.message : "Unable to fetch platform stats.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadStats();
    window.addEventListener("edulearnx-data-change", loadStats);

    return () => {
      isMounted = false;
      window.removeEventListener("edulearnx-data-change", loadStats);
    };
  }, []);

  return { ...stats, isLoading, error };
}
