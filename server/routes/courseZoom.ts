import type { RequestHandler } from "express";
import { query } from "../db/connection.js";
import { hasAdminFeatureAccess } from "../utils/adminPermissionMiddleware.js";
import { normalizeZoomLink } from "../../shared/courseZoom.js";

export const getCourseZoomLinks: RequestHandler = async (req, res) => {
  const actor = req.user;
  if (!actor) return res.status(401).json({ success: false, error: "Authentication required" });
  res.set("Cache-Control", "no-store");
  try {
    let filter: string;
    let params: unknown[] = [actor.userId];
    if (actor.role === "teacher") {
      filter = "WHERE c.instructor_id = $1";
    } else if (actor.role === "student") {
      filter = "WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = $1)";
    } else if (actor.role === "admin" && await hasAdminFeatureAccess(actor.userId, "courses")) {
      filter = "";
      params = [];
    } else {
      return res.status(403).json({ success: false, error: "Course access required" });
    }
    const result = await query(`SELECT c.id AS course_id, c.zoom_link FROM courses c ${filter} ORDER BY c.id`, params);
    return res.json({ success: true, data: result.rows });
  } catch {
    return res.status(500).json({ success: false, error: "Unable to load class links. Please try again." });
  }
};

export const updateCourseZoomLink: RequestHandler = async (req, res) => {
  const actor = req.user;
  if (!actor) return res.status(401).json({ success: false, error: "Authentication required" });
  if (!["teacher", "admin"].includes(actor.role)) {
    return res.status(403).json({ success: false, error: "Only the assigned teacher or a course administrator can change this link." });
  }
  const courseId = String(req.params.id || "");
  if (!/^(?:\d+|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.test(courseId)) {
    return res.status(400).json({ success: false, error: "Invalid course ID" });
  }
  let zoomLink: string | null;
  try { zoomLink = normalizeZoomLink(req.body?.zoom_link); }
  catch (error) { return res.status(400).json({ success: false, error: (error as Error).message }); }

  try {
    if (actor.role === "admin" && !await hasAdminFeatureAccess(actor.userId, "courses")) {
      return res.status(403).json({ success: false, error: "Course management permission required" });
    }
    const course = (await query("SELECT id, instructor_id FROM courses WHERE id = $1", [courseId])).rows[0];
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });
    if (actor.role === "teacher" && String(course.instructor_id) !== String(actor.userId)) {
      return res.status(403).json({ success: false, error: "You can only change links for your assigned courses." });
    }
    const params: unknown[] = [zoomLink, courseId];
    const assignedTeacherFilter = actor.role === "teacher" ? " AND instructor_id = $3" : "";
    if (actor.role === "teacher") params.push(actor.userId);
    // Recheck assignment in the write in case the course was reassigned after the read.
    const result = await query(
      `UPDATE courses SET zoom_link = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2${assignedTeacherFilter} RETURNING id AS course_id, zoom_link`,
      params,
    );
    if (!result.rows.length) return res.status(403).json({ success: false, error: "The course assignment changed. Refresh and try again." });
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: result.rows[0], message: zoomLink ? "Zoom link saved." : "Zoom link removed." });
  } catch {
    return res.status(500).json({ success: false, error: "Unable to save the Zoom link. Please try again." });
  }
};
