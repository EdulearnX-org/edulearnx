import { RequestHandler } from "express";
import crypto from "node:crypto";
import { query } from "../db/connection.js";
import type { Course, CreateCourseRequest, ApiResponse } from "@shared/api";
import { hasAdminFeatureAccess } from "../utils/adminPermissionMiddleware.js";

function meetingId() {
  return `ELX-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export const getCourses: RequestHandler = async (req, res) => {
  try {
    const result = await query(
      `SELECT
        c.*,
        u.full_name AS instructor_name,
        (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count
      FROM courses c
      LEFT JOIN users u ON u.id = c.instructor_id
      ORDER BY c.created_at DESC`
    );
    res.set("Cache-Control", "private, max-age=30");
    res.json({
      success: true,
      data: result.rows,
      message: "Courses fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    // Fast-fail: return error immediately
    res.status(500).json({
      success: false,
      error: error instanceof Error && error.message.includes("timed out")
        ? "Database query timed out. Please try again."
        : "Failed to fetch courses",
    });
  }
};

export const getCourseById: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT
        c.id,
        c.title,
        c.description,
        c.category,
        c.duration_weeks,
        c.start_date,
        c.end_date,
        c.thumbnail_url,
        c.price_cents,
        c.meeting_id,
        c.is_published,
        c.created_at,
        c.updated_at,
        c.instructor_id,
        u.full_name AS instructor_name,
        COALESCE(ec.enrollment_count, 0)::int AS enrollment_count
      FROM courses c
      LEFT JOIN users u ON u.id = c.instructor_id
      LEFT JOIN (
        SELECT course_id, COUNT(*)::int AS enrollment_count
        FROM enrollments
        GROUP BY course_id
      ) ec ON ec.course_id = c.id
      WHERE c.id = $1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Course fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course",
    });
  }
};

export const createCourse: RequestHandler = async (req, res) => {
  try {
    const {
      title,
      description,
      instructor_id,
      category,
      duration_weeks,
      start_date,
      end_date,
      thumbnail_url,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: title",
      });
    }

    if (start_date && end_date && new Date(start_date).getTime() > new Date(end_date).getTime()) {
      return res.status(400).json({
        success: false,
        error: "Course end date must be after the start date",
      });
    }

    const result = await query(
      "INSERT INTO courses (title, description, instructor_id, category, duration_weeks, start_date, end_date, thumbnail_url, meeting_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
      [
        title,
        description || null,
        instructor_id || null,
        category || null,
        duration_weeks || null,
        start_date || null,
        end_date || null,
        thumbnail_url || null,
        meetingId(),
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Course created successfully",
    });
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create course",
    });
  }
};

export const updateCourse: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, duration_weeks, start_date, end_date, is_published, instructor_id } =
      req.body;
    const instructorProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "instructor_id",
    );

    if (start_date && end_date && new Date(start_date).getTime() > new Date(end_date).getTime()) {
      return res.status(400).json({
        success: false,
        error: "Course end date must be after the start date",
      });
    }

    const result = await query(
      "UPDATE courses SET title = COALESCE($1, title), description = COALESCE($2, description), category = COALESCE($3, category), duration_weeks = COALESCE($4, duration_weeks), start_date = COALESCE($5, start_date), end_date = COALESCE($6, end_date), is_published = COALESCE($7, is_published), instructor_id = CASE WHEN $8 THEN $9 ELSE instructor_id END, updated_at = CURRENT_TIMESTAMP WHERE id = $10 RETURNING *",
      [
        title || null,
        description || null,
        category || null,
        duration_weeks || null,
        start_date || null,
        end_date || null,
        is_published !== undefined ? is_published : null,
        instructorProvided,
        instructor_id || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Course updated successfully",
    });
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update course",
    });
  }
};

export const deleteCourse: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM courses WHERE id = $1 RETURNING id", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete course",
    });
  }
};

export const enrollStudent: RequestHandler = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin" || !(await hasAdminFeatureAccess(req.user.userId, "users"))) {
      return res.status(403).json({ success: false, error: "Enrollment management access required" });
    }

    const { student_id, course_id } = req.body;

    if (!student_id || !course_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: student_id, course_id",
      });
    }

    const result = await query(
      "INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2) RETURNING *",
      [student_id, course_id]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Student enrolled successfully",
    });
  } catch (error: any) {
    console.error("Error enrolling student:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Student already enrolled in this course",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to enroll student",
    });
  }
};

export const getEnrollments: RequestHandler = async (req, res) => {
  try {
    const actor = req.user;
    if (!actor) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    let { course_id, student_id } = req.query;
    if (actor.role === "student") {
      if (student_id && String(student_id) !== String(actor.userId)) {
        return res.status(403).json({ success: false, error: "You may only view your own enrollments" });
      }
      student_id = String(actor.userId);
    } else if (actor.role !== "admin" || !(await hasAdminFeatureAccess(actor.userId, "users"))) {
      return res.status(403).json({ success: false, error: "Enrollment access required" });
    }

    // Validate IDs are numeric (DB uses integer PKs)
    const isValidId = (v: unknown): v is string =>
      typeof v === "string" && /^\d+$/.test(v);

    if (student_id && !isValidId(student_id)) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }
    if (course_id && !isValidId(course_id)) {
      return res.status(400).json({ success: false, error: "Invalid course id" });
    }

    let queryStr = `SELECT
      e.*,
      c.title AS course_title,
      c.description AS course_description,
      c.category AS course_category,
      c.duration_weeks AS course_duration_weeks,
      c.start_date AS course_start_date,
      c.end_date AS course_end_date,
      c.thumbnail_url AS course_thumbnail_url,
      u.full_name AS instructor_name
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN users u ON u.id = c.instructor_id
    WHERE 1=1`;
    const params: unknown[] = [];

    if (course_id) {
      queryStr += ` AND e.course_id = $${params.length + 1}`;
      params.push(course_id);
    }

    if (student_id) {
      queryStr += ` AND e.student_id = $${params.length + 1}`;
      params.push(student_id);
    }

    queryStr += " ORDER BY e.enrolled_at DESC";

    const result = await query(queryStr, params);

    res.json({
      success: true,
      data: result.rows,
      message: "Enrollments fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch enrollments",
    });
  }
};

export const deleteEnrollment: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM enrollments WHERE id = $1 RETURNING id", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Enrollment not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Enrollment removed successfully",
    });
  } catch (error) {
    console.error("Error removing enrollment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove enrollment",
    });
  }
};
