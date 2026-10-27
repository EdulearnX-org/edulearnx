import type { RequestHandler } from "express";
import { query, isDatabaseConfigured } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
import { canAccessStudentData } from "../utils/studentDataAccess.js";

const coinsPerClass = 20;
const fullWeekBonus = 100;

export const getStudentRewards: RequestHandler = async (req, res) => {
  const studentId = req.params.id;

  if (typeof studentId !== "string" || !studentId) {
    return sendError(res, "A valid student id is required", 400);
  }

  if (
    !req.user ||
    !(await canAccessStudentData(req.user, studentId, undefined, "users"))
  ) {
    return sendError(res, "Student rewards access required", 403);
  }

  if (!isDatabaseConfigured) {
    return sendSuccess(
      res,
      {
        totalCoins: 0,
        classCoins: 0,
        bonusCoins: 0,
        attendedClasses: 0,
        completedWeeks: 0,
        coinsPerClass,
        fullWeekBonus,
      },
      "Student rewards fetched successfully",
    );
  }

  try {
    const attendanceResult = await query(
      `
        SELECT COUNT(DISTINCT live_class_id)::int AS attended_classes
        FROM live_class_attendance
        WHERE user_id = $1 AND role = 'student'
      `,
      [studentId],
    );

    const attendedClasses = Number(attendanceResult.rows[0]?.attended_classes ?? 0);
    const completedWeeks = Math.floor(attendedClasses / 5);
    const classCoins = attendedClasses * coinsPerClass;
    const bonusCoins = completedWeeks * fullWeekBonus;
    const totalCoins = classCoins + bonusCoins;

    return sendSuccess(
      res,
      {
        totalCoins,
        classCoins,
        bonusCoins,
        attendedClasses,
        completedWeeks,
        coinsPerClass,
        fullWeekBonus,
      },
      "Student rewards fetched successfully",
    );
  } catch (error) {
    console.error("Error fetching student rewards:", error);
    return sendError(res, "Failed to fetch student rewards", 500);
  }
};
