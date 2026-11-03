import { useQuery } from "@tanstack/react-query";
import { readApiResponse } from "@/lib/api";
import { useCurrentUser } from "@/lib/user";
import type { CourseZoomLink } from "@shared/courseZoom";

export function useCourseZoomLinks() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ["course-zoom-links", user?.id, user?.role],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/course-zoom-links", { signal, cache: "no-store" });
      const payload = await readApiResponse(response);
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load class links.");
      return payload.data as CourseZoomLink[];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
