import type { RequestHandler } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { query } from "../db/connection.js";
import { hasAdminFeatureAccess } from "../utils/adminPermissionMiddleware.js";
import { courseVisibility } from "../utils/courseAccess.js";
import { transaction } from "../utils/transaction.js";
import { HttpError, respondError } from "../utils/errors.js";
import { dateSchema, idSchema, moneySchema, optionalText } from "../../shared/validation.js";
import { courseProgressSql } from "../utils/courseProgress.js";

const fields = z.object({
  title: z.string().trim().min(1).max(255),
  description: optionalText(20_000),
  category: optionalText(100),
  instructor_id: idSchema.nullable().optional(),
  duration_weeks: z.number().int().min(1).max(520).nullable().optional(),
  start_date: dateSchema.nullable().optional(),
  end_date: dateSchema.nullable().optional(),
  thumbnail_url: z.union([z.literal(""), z.url().max(2048).refine(value => /^https?:/.test(value))]).nullable().optional(),
  price_cents: moneySchema,
  is_published: z.boolean().optional(),
}).strict();
const selectCourse = `SELECT c.id, c.title, c.description, c.instructor_id, c.category,
  c.duration_weeks, c.start_date, c.end_date, c.thumbnail_url, c.meeting_id,
  c.price_cents, c.is_published, c.created_at, c.updated_at,
  u.full_name AS instructor_name,
  (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id=c.id) AS enrollment_count
  FROM courses c LEFT JOIN users u ON u.id=c.instructor_id`;

export const getCourses: RequestHandler = async (req, res) => {
  try {
    const access = await courseVisibility(req.user);
    const result = await query(`${selectCourse} WHERE ${access.sql} ORDER BY c.created_at DESC`, access.params);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: result.rows });
  } catch (error) { return respondError(res, error, "Failed to fetch courses"); }
};

export const getCourseById: RequestHandler = async (req, res) => {
  try {
    const id = idSchema.parse(req.params.id);
    const access = await courseVisibility(req.user);
    const result = await query(`${selectCourse} WHERE ${access.sql} AND c.id=$${access.params.length + 1}`, [...access.params, id]);
    if (!result.rows[0]) throw new HttpError(404, "Course not found");
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) { return respondError(res, error, "Failed to fetch course"); }
};

function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null;
}
async function validateCourse(client: { query: typeof query }, course: Record<string, any>) {
  const start = dateOnly(course.start_date), end = dateOnly(course.end_date);
  if (start && end && start > end) throw new HttpError(400, "Course end date must be on or after its start date");
  if (course.instructor_id) {
    const teacher = await client.query("SELECT id FROM users WHERE id=$1 AND role='teacher' AND is_active IS DISTINCT FROM FALSE FOR SHARE", [course.instructor_id]);
    if (!teacher.rows.length) throw new HttpError(400, "Choose an active teacher");
  }
}

export const createCourse: RequestHandler = async (req, res) => {
  try {
    const values = fields.parse(req.body);
    const course = await transaction(async client => {
      await validateCourse(client, values);
      const result = await client.query(`INSERT INTO courses
        (title,description,instructor_id,category,duration_weeks,start_date,end_date,thumbnail_url,price_cents,is_published,meeting_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [values.title, values.description || null, values.instructor_id ?? null, values.category || null,
          values.duration_weeks ?? null, values.start_date ?? null, values.end_date ?? null,
          values.thumbnail_url || null, values.price_cents, values.is_published ?? false,
          `ELX-${crypto.randomBytes(5).toString("hex").toUpperCase()}`]);
      return result.rows[0];
    });
    return res.status(201).json({ success: true, data: course });
  } catch (error) { return respondError(res, error, "Failed to create course"); }
};

export const updateCourse: RequestHandler = async (req, res) => {
  try {
    const id = idSchema.parse(req.params.id), patch = fields.partial().parse(req.body);
    const course = await transaction(async client => {
      const existing = (await client.query("SELECT * FROM courses WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new HttpError(404, "Course not found");
      const values = { ...existing, ...patch };
      await validateCourse(client, values);
      const result = await client.query(`UPDATE courses SET title=$1,description=$2,instructor_id=$3,category=$4,
        duration_weeks=$5,start_date=$6,end_date=$7,thumbnail_url=$8,price_cents=$9,is_published=$10,
        updated_at=CURRENT_TIMESTAMP WHERE id=$11 RETURNING *`,
        [values.title, values.description || null, values.instructor_id ?? null, values.category || null,
          values.duration_weeks, dateOnly(values.start_date), dateOnly(values.end_date),
          values.thumbnail_url || null, values.price_cents, values.is_published, id]);
      return result.rows[0];
    });
    return res.json({ success: true, data: course });
  } catch (error) { return respondError(res, error, "Failed to update course"); }
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
      idSchema.safeParse(v).success;

    if (student_id && !isValidId(student_id)) {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }
    if (course_id && !isValidId(course_id)) {
      return res.status(400).json({ success: false, error: "Invalid course id" });
    }

    let queryStr = `SELECT
      e.*,
      ${courseProgressSql("e.student_id", "e.course_id")} AS progress_percentage,
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
