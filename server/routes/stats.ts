import { RequestHandler } from "express";
import { query } from "../db/connection.js";
import { getPendingEnrollmentRequestCount } from "./enrollmentRequests.js";

// In-memory cache to avoid DB round-trips on warm serverless invocations
let cachedStats: {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  totalEnrollments: number;
  pendingEnrollmentRequests: number;
  revenue: number;
} | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

export const getPlatformStats: RequestHandler = async (_req, res) => {
  // Serve from cache if fresh
  if (cachedStats && Date.now() - cachedAt < CACHE_TTL_MS) {
    return res.json({
      success: true,
      data: cachedStats,
      message: "Stats fetched successfully",
    });
  }

  try {
    const hasEnrollmentStorage = Boolean(
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    );
    const [result, pendingRequests] = await Promise.all([query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'student') AS total_students,
        (SELECT COUNT(*)::int FROM users WHERE role = 'teacher') AS total_teachers,
        (SELECT COUNT(*)::int FROM courses) AS total_courses,
        (SELECT COUNT(*)::int FROM enrollments) AS total_enrollments
    `), hasEnrollmentStorage ? getPendingEnrollmentRequestCount() : Promise.resolve(0)]);

    const row = result.rows[0];
    cachedStats = {
      totalStudents: row.total_students,
      totalTeachers: row.total_teachers,
      totalCourses: row.total_courses,
      totalEnrollments: row.total_enrollments,
      pendingEnrollmentRequests: pendingRequests,
      revenue: 0,
    };
    cachedAt = Date.now();

    res.json({
      success: true,
      data: cachedStats,
      message: "Stats fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch platform stats",
    });
  }
};
