import { useEffect, useState } from "react";
import { readApiResponse } from "@/lib/api";

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

type PublicStats = Pick<PlatformStats, "totalStudents" | "totalCourses" | "totalEnrollments">;
const emptyPublicStats: PublicStats = {
  totalStudents: 0,
  totalCourses: 0,
  totalEnrollments: 0,
};

function useStats<T extends object>(endpoint: string, initialStats: T) {
  const [stats, setStats] = useState(initialStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(endpoint);
        const payload = await readApiResponse(response);

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to fetch platform stats.");
        }

        if (isMounted) {
          setStats({ ...initialStats, ...payload.data });
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setStats(initialStats);
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
  }, [endpoint, initialStats]);

  return { ...stats, isLoading, error };
}

export function usePortalStats() {
  return useStats("/api/platform-stats", emptyStats);
}

export function usePublicStats() {
  return useStats("/api/public-stats", emptyPublicStats);
}
