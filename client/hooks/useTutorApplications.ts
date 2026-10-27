import { useCallback, useEffect, useState } from "react";

export type TutorApplication = {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  expertise: string;
  experience_years: number;
  certificate_1: string | null;
  certificate_2: string | null;
  certificate_3: string | null;
  bio: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
};

export function useTutorApplications(status?: string) {
  const [applications, setApplications] = useState<TutorApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const response = await fetch(`/api/tutor-applications${query}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to fetch tutor applications.");
      }

      setApplications(payload.data || []);
      setError("");
    } catch (err) {
      setApplications([]);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to fetch tutor applications.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadApplications();
    window.addEventListener("edulearnx-data-change", loadApplications);

    return () => {
      window.removeEventListener("edulearnx-data-change", loadApplications);
    };
  }, [loadApplications]);

  return { applications, isLoading, error, reload: loadApplications };
}
