import { useCallback, useEffect, useState } from "react";

export type EnrollmentRequest = {
  id: number | string;
  student_id: number | string;
  course_id: number | string;
  status: "pending" | "approved" | "rejected";
  submission_state: "uploading" | "complete" | "failed";
  cleanup_status: "none" | "queued" | "cleaning" | "failed" | "complete";
  cleanup_attempts: number;
  cleanup_error: string | null;
  student_phone: string;
  requested_at: string;
  reviewed_at: string | null;
  student_email: string;
  student_name: string;
  course_title: string;
  transfer_reference: string | null;
  sender_account_title: string | null;
  sender_account_number: string | null;
};

export function useEnrollmentRequests(status?: string, studentId?: number | string) {
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (status) {
        params.set("status", status);
      }
      if (studentId) {
        params.set("student_id", String(studentId));
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/enrollment-requests${query}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to fetch enrollment requests.");
      }

      setRequests(payload.data || []);
      setError("");
    } catch (err) {
      setRequests([]);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to fetch enrollment requests.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [status, studentId]);

  useEffect(() => {
    loadRequests();
    window.addEventListener("edulearnx-data-change", loadRequests);

    return () => {
      window.removeEventListener("edulearnx-data-change", loadRequests);
    };
  }, [loadRequests]);

  return { requests, isLoading, error, reload: loadRequests };
}
