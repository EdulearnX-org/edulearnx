import { useCallback, useEffect, useState } from "react";
import type { LiveClass } from "@shared/api";

type LiveClassFilters = {
  courseId?: number | string;
  teacherId?: number | string;
  studentId?: number | string;
};

export function useLiveClasses(filters: LiveClassFilters = {}) {
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const { courseId, teacherId, studentId } = filters;

  const loadLiveClasses = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (courseId) {
        params.set("course_id", String(courseId));
      }
      if (teacherId) {
        params.set("teacher_id", String(teacherId));
      }
      if (studentId) {
        params.set("student_id", String(studentId));
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/live-classes${query}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to fetch live classes.");
      }

      setLiveClasses(payload.data || []);
      setError("");
    } catch (err) {
      setLiveClasses([]);
      setError(err instanceof Error ? err.message : "Unable to fetch live classes.");
    } finally {
      setIsLoading(false);
    }
  }, [courseId, teacherId, studentId]);

  useEffect(() => {
    loadLiveClasses();
    window.addEventListener("edulearnx-data-change", loadLiveClasses);
    return () => {
      window.removeEventListener("edulearnx-data-change", loadLiveClasses);
    };
  }, [loadLiveClasses]);

  return { liveClasses, isLoading, error, reload: loadLiveClasses };
}

export function liveClassWindowLabel(liveClass: LiveClass) {
  const start = new Date(liveClass.scheduled_start);
  const end = new Date(liveClass.scheduled_end);
  return `${start.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function localTimeZoneLabel() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "your timezone";
}

export function localLiveClassWindowLabel(liveClass: LiveClass) {
  return `${liveClassWindowLabel(liveClass)}. This is your local time (${localTimeZoneLabel()}).`;
}

export function buildFiveWeekdayClassTimes(
  startTime: string,
  durationMinutes: number,
) {
  const [hours, minutes] = startTime.split(":").map(Number);

  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return [];
  }

  const sessions: Array<{ scheduled_start: string; scheduled_end: string }> = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);

  while (sessions.length < 5) {
    const day = cursor.getDay();
    const startsAt = new Date(cursor);
    startsAt.setHours(hours, minutes, 0, 0);

    if (day >= 1 && day <= 5 && startsAt.getTime() > Date.now()) {
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
      sessions.push({
        scheduled_start: startsAt.toISOString(),
        scheduled_end: endsAt.toISOString(),
      });
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return sessions;
}
