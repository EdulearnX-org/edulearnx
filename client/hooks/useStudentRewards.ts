import { useEffect, useState } from "react";
import { readApiResponse } from "@/lib/api";

export type StudentRewards = {
  totalCoins: number;
  classCoins: number;
  bonusCoins: number;
  attendedClasses: number;
  completedWeeks: number;
  coinsPerClass: number;
  fullWeekBonus: number;
};

const emptyRewards: StudentRewards = {
  totalCoins: 0,
  classCoins: 0,
  bonusCoins: 0,
  attendedClasses: 0,
  completedWeeks: 0,
  coinsPerClass: 20,
  fullWeekBonus: 100,
};

export function useStudentRewards(studentId?: number | string) {
  const [rewards, setRewards] = useState<StudentRewards>(emptyRewards);
  const [isLoading, setIsLoading] = useState(Boolean(studentId));
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (!studentId) {
      setRewards(emptyRewards);
      setIsLoading(false);
      setError("");
      return () => {
        isMounted = false;
      };
    }

    const loadRewards = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/students/${studentId}/rewards`);
        const payload = await readApiResponse(response);

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to fetch rewards.");
        }

        if (isMounted) {
          setRewards({ ...emptyRewards, ...(payload.data ?? emptyRewards) });
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setRewards(emptyRewards);
          setError(err instanceof Error ? err.message : "Unable to fetch rewards.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadRewards();
    return () => {
      isMounted = false;
    };
  }, [studentId]);

  return { rewards, isLoading, error };
}
