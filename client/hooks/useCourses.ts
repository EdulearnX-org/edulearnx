import { useEffect, useState } from "react";
import { readApiResponse } from "@/lib/api";

export type DatabaseCourse = {
  id: number | string;
  title: string;
  description: string | null;
  instructor_id: number | string | null;
  instructor_name: string | null;
  category: string | null;
  duration_weeks: number | null;
  start_date: string | null;
  end_date: string | null;
  thumbnail_url: string | null;
  meeting_id?: string | null;
  is_published: boolean;
  enrollment_count: number;
  created_at: string;
  updated_at: string;
  price_cents: number;
};

type CoursesState = {
  courses: DatabaseCourse[];
  error: string;
};

const COURSES_CACHE_MS = 60_000;
let cachedCourses: CoursesState | null = null;
let cachedAt = 0;
let coursesRequest: Promise<CoursesState> | null = null;

export async function preloadCourses({ force = false } = {}) {
  const now = Date.now();

  if (
    !force &&
    cachedCourses &&
    now - cachedAt < COURSES_CACHE_MS
  ) {
    return cachedCourses;
  }

  if (!force && coursesRequest) {
    return coursesRequest;
  }

  coursesRequest = (async () => {
    const response = await fetch("/api/courses");
    const payload = await readApiResponse(response);

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Unable to fetch courses.");
    }

    const nextState = {
      courses: payload.data || [],
      error: "",
    };
    cachedCourses = nextState;
    cachedAt = Date.now();
    return nextState;
  })().finally(() => {
    coursesRequest = null;
  });

  return coursesRequest;
}

export function clearCoursesCache() {
  cachedCourses = null;
  cachedAt = 0;
  coursesRequest = null;
}

export function useCourses() {
  const [courses, setCourses] = useState<DatabaseCourse[]>(
    () => cachedCourses?.courses ?? [],
  );
  const [isLoading, setIsLoading] = useState(() => !cachedCourses);
  const [error, setError] = useState(() => cachedCourses?.error ?? "");

  useEffect(() => {
    let isMounted = true;

    const loadCourses = async ({ force = false } = {}) => {
      try {
        if (!cachedCourses || force) {
          setIsLoading(true);
        }

        const nextState = await preloadCourses({ force });

        if (isMounted) {
          setCourses(nextState.courses);
          setError(nextState.error);
        }
      } catch (err) {
        if (isMounted) {
          setCourses([]);
          setError(err instanceof Error ? err.message : "Unable to fetch courses.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCourses();
    const refreshCourses = () => {
      clearCoursesCache();
      void loadCourses({ force: true });
    };
    window.addEventListener("edulearnx-data-change", refreshCourses);

    return () => {
      isMounted = false;
      window.removeEventListener("edulearnx-data-change", refreshCourses);
    };
  }, []);

  return { courses, isLoading, error };
}

export function courseDuration(course: DatabaseCourse) {
  return course.duration_weeks ? `${course.duration_weeks} weeks` : "Not set";
}

export function courseDateRange(course: {
  start_date?: string | null;
  end_date?: string | null;
}) {
  const format = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const date =
      year && month && day ? new Date(year, month - 1, day) : new Date(value);

    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (course.start_date && course.end_date) {
    return `${format(course.start_date)} - ${format(course.end_date)}`;
  }

  if (course.start_date) {
    return `Starts ${format(course.start_date)}`;
  }

  if (course.end_date) {
    return `Ends ${format(course.end_date)}`;
  }

  return "Not set";
}
