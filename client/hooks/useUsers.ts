import { useEffect, useState } from "react";

export type DatabaseUser = {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  phone?: string | null;
  profile_image_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function useUsers() {
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/users");
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to fetch users.");
        }

        if (isMounted) {
          setUsers(payload.data || []);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setUsers([]);
          setError(err instanceof Error ? err.message : "Unable to fetch users.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadUsers();
    window.addEventListener("edulearnx-data-change", loadUsers);

    return () => {
      isMounted = false;
      window.removeEventListener("edulearnx-data-change", loadUsers);
    };
  }, []);

  return { users, isLoading, error };
}
