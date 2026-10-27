import { Request, Response, RequestHandler } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { query } from "../db/connection.js";
import { isPrimaryAdmin, normalizeAdminPermissions } from "../../shared/adminPermissions.js";

const joinWindowMinutes = 5;

const liveClassSelect = `
  SELECT
    lc.*,
    c.title AS course_title,
    c.meeting_id,
    u.full_name AS teacher_name
  FROM live_classes lc
  JOIN courses c ON c.id = lc.course_id
  LEFT JOIN users u ON u.id = lc.teacher_id
`;

function roomId() {
  return `live_${crypto.randomBytes(12).toString("hex")}`;
}

function joinState(row: { scheduled_start: string | Date; scheduled_end: string | Date; status: string }) {
  const now = Date.now();
  const start = new Date(row.scheduled_start).getTime();
  const end = new Date(row.scheduled_end).getTime();
  const opensAt = start - joinWindowMinutes * 60 * 1000;
  return {
    join_opens_at: new Date(opensAt).toISOString(),
    can_join: row.status === "active" && now >= opensAt && now <= end,
    has_ended: now > end || row.status === "completed" || row.status === "cancelled",
  };
}

function withJoinState(rows: Array<Record<string, any>>) {
  return rows.map((row) => ({
    ...row,
    ...joinState(row as any),
  }));
}

async function getActor(req: Request, res: Response) {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, error: "Active account required" });
    return null;
  }

  const result = await query(
    "SELECT id, email, role, is_active, admin_permissions FROM users WHERE id = $1",
    [req.user.userId],
  );
  const actor = result.rows[0];
  if (!actor?.is_active) {
    res.status(401).json({ success: false, error: "Active account required" });
    return null;
  }
  if (
    actor.role === "admin" &&
    !isPrimaryAdmin(actor.email) &&
    !normalizeAdminPermissions(actor.admin_permissions).liveClasses
  ) {
    res.status(403).json({ success: false, error: "You do not have permission to manage live classes" });
    return null;
  }
  return actor;
}

function canManageClass(actor: any, row: any) {
  return actor.role === "admin" ||
    (actor.role === "teacher" && String(row.teacher_id) === String(actor.id));
}

async function isEnrolled(studentId: number | string, courseId: number | string) {
  const result = await query(
    "SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2",
    [studentId, courseId],
  );
  return result.rows.length > 0;
}

function classIsActive(row: any) {
  return row.status === "active" && Date.now() <= new Date(row.scheduled_end).getTime();
}

export const getLiveClasses: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { course_id } = req.query;
    const params: unknown[] = [];
    const where: string[] = [];
    let sql = liveClassSelect;

    if (actor.role === "student") {
      params.push(actor.id);
      where.push(`EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.course_id = lc.course_id AND e.student_id = $${params.length}
      )`);
    } else if (actor.role === "teacher") {
      params.push(actor.id);
      where.push(`lc.teacher_id = $${params.length}`);
    } else if (actor.role !== "admin") {
      return res.status(403).json({ success: false, error: "Live class access required" });
    }

    if (course_id) {
      params.push(String(course_id));
      where.push(`lc.course_id = $${params.length}`);
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }

    sql += " ORDER BY lc.scheduled_start ASC";

    const result = await query(sql, params);
    res.json({
      success: true,
      data: withJoinState(result.rows),
      message: "Live classes fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching live classes:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch live classes",
    });
  }
};

export const createLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    if (actor.role !== "teacher" && actor.role !== "admin") {
      return res.status(403).json({ success: false, error: "Teacher access required" });
    }

    const {
      course_id,
      teacher_id,
      title,
      description,
      scheduled_start,
      scheduled_end,
    } = req.body;

    if (!course_id || !title || !scheduled_start || !scheduled_end) {
      return res.status(400).json({
        success: false,
        error: "Course, title, start time, and end time are required",
      });
    }

    if (new Date(scheduled_start).getTime() >= new Date(scheduled_end).getTime()) {
      return res.status(400).json({
        success: false,
        error: "End time must be after start time",
      });
    }

    const courseResult = await query(
      "SELECT id, instructor_id FROM courses WHERE id = $1",
      [course_id],
    );
    const course = courseResult.rows[0];
    if (!course) {
      return res.status(404).json({ success: false, error: "Course not found" });
    }
    if (actor.role === "teacher" && String(course.instructor_id) !== String(actor.id)) {
      return res.status(403).json({ success: false, error: "You can only schedule classes for your assigned courses" });
    }

    const resolvedTeacherId = actor.role === "teacher"
      ? actor.id
      : teacher_id || course.instructor_id || null;

    const created = await query(
      `INSERT INTO live_classes (
        course_id,
        teacher_id,
        title,
        description,
        scheduled_start,
        scheduled_end,
        room_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        course_id,
        resolvedTeacherId,
        String(title).trim(),
        description ? String(description).trim() : null,
        scheduled_start,
        scheduled_end,
        roomId(),
      ],
    );

    res.status(201).json({
      success: true,
      data: withJoinState(created.rows)[0],
      message: "Live class scheduled successfully",
    });
  } catch (error) {
    console.error("Error creating live class:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create live class",
    });
  }
};

export const updateLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    if (actor.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    const { id } = req.params;
    const {
      course_id,
      teacher_id,
      title,
      description,
      scheduled_start,
      scheduled_end,
      status,
    } = req.body;

    if (status && !["scheduled", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid live class status",
      });
    }

    const result = await query(
      `UPDATE live_classes
       SET course_id = COALESCE($1, course_id),
           teacher_id = CASE WHEN $2 THEN $3 ELSE teacher_id END,
           title = COALESCE($4, title),
           description = CASE WHEN $5 THEN $6 ELSE description END,
           scheduled_start = COALESCE($7, scheduled_start),
           scheduled_end = COALESCE($8, scheduled_end),
           status = COALESCE($9, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        course_id || null,
        Object.prototype.hasOwnProperty.call(req.body, "teacher_id"),
        teacher_id || null,
        title ? String(title).trim() : null,
        Object.prototype.hasOwnProperty.call(req.body, "description"),
        description ? String(description).trim() : null,
        scheduled_start || null,
        scheduled_end || null,
        status || null,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Live class not found",
      });
    }

    res.json({
      success: true,
      data: withJoinState(result.rows)[0],
      message: "Live class updated successfully",
    });
  } catch (error) {
    console.error("Error updating live class:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update live class",
    });
  }
};

export const deleteLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    if (actor.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    const { id } = req.params;
    const result = await query("DELETE FROM live_classes WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Live class not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Live class deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting live class:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete live class",
    });
  }
};

export const startLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    if (!["teacher", "admin"].includes(actor.role)) {
      return res.status(403).json({ success: false, error: "Teacher access required" });
    }
    if (!process.env.ZOOM_VIDEO_SDK_KEY || !process.env.ZOOM_VIDEO_SDK_SECRET) {
      return res.status(503).json({
        success: false,
        error: "Zoom Video SDK is not configured. Set ZOOM_VIDEO_SDK_KEY and ZOOM_VIDEO_SDK_SECRET on the server.",
      });
    }

    const result = await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id]);
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: "Live class not found" });
    }
    if (!canManageClass(actor, row)) {
      return res.status(403).json({ success: false, error: "Only the assigned teacher can start this class" });
    }
    if (row.status === "active") {
      return res.json({ success: true, data: withJoinState([row])[0] });
    }
    if (row.status !== "scheduled") {
      return res.status(409).json({ success: false, error: "This class can no longer be started" });
    }
    const now = Date.now();
    if (now < new Date(row.scheduled_start).getTime() - joinWindowMinutes * 60_000 ||
        now > new Date(row.scheduled_end).getTime()) {
      return res.status(409).json({ success: false, error: "This class is outside its scheduled start window" });
    }

    const started = await query(
      `UPDATE live_classes
       SET status = 'active', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'scheduled'
       RETURNING *`,
      [req.params.id],
    );
    if (started.rows.length === 0) {
      return res.status(409).json({ success: false, error: "This class is already active or has ended" });
    }
    res.json({ success: true, data: withJoinState(started.rows)[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, error: "Another class for this course is already active" });
    }
    console.error("Error starting live class:", error);
    res.status(500).json({ success: false, error: "Unable to start live class" });
  }
};

export const endLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    if (!["teacher", "admin"].includes(actor.role)) {
      return res.status(403).json({ success: false, error: "Teacher access required" });
    }
    const result = await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id]);
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: "Live class not found" });
    }
    if (!canManageClass(actor, row)) {
      return res.status(403).json({ success: false, error: "Only the assigned teacher can end this class" });
    }
    if (row.status === "completed") {
      return res.json({ success: true, data: row });
    }
    if (row.status !== "active") {
      return res.status(409).json({ success: false, error: "Only an active class can be ended" });
    }

    await query(
      `UPDATE live_class_attendance
       SET left_at = CURRENT_TIMESTAMP,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at))::int)
       WHERE live_class_id = $1 AND left_at IS NULL`,
      [req.params.id],
    );
    const ended = await query(
      `UPDATE live_classes
       SET status = 'completed', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [req.params.id],
    );
    res.json({ success: true, data: ended.rows[0] });
  } catch (error) {
    console.error("Error ending live class:", error);
    res.status(500).json({ success: false, error: "Unable to end live class" });
  }
};

export const getLiveClassStatus: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    const result = await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id]);
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: "Live class not found" });
    }
    if (actor.role === "teacher" && !canManageClass(actor, row)) {
      return res.status(403).json({ success: false, error: "Only the assigned teacher can access this class" });
    }
    if (actor.role === "student" && !(await isEnrolled(actor.id, row.course_id))) {
      return res.status(403).json({ success: false, error: "Only enrolled students can access this class" });
    }
    if (!["admin", "teacher", "student"].includes(actor.role)) {
      return res.status(403).json({ success: false, error: "Live class access required" });
    }
    const status = row.status === "active" && Date.now() > new Date(row.scheduled_end).getTime()
      ? "completed"
      : row.status;
    res.json({ success: true, data: { id: row.id, status } });
  } catch (error) {
    console.error("Error fetching live class status:", error);
    res.status(500).json({ success: false, error: "Unable to check live class status" });
  }
};

export const joinLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const liveClass = await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id]);
    if (liveClass.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Live class not found",
      });
    }

    const row = liveClass.rows[0];
    const state = joinState(row);

    if (actor.role === "student" && !(await isEnrolled(actor.id, row.course_id))) {
      return res.status(403).json({ success: false, error: "Only enrolled students can join this class" });
    }
    if (actor.role === "teacher" && !canManageClass(actor, row)) {
      return res.status(403).json({ success: false, error: "Only the assigned teacher can host this class" });
    }
    if (!["admin", "teacher", "student"].includes(actor.role)) {
      return res.status(403).json({ success: false, error: "Live class access required" });
    }
    if (!classIsActive(row)) {
      return res.status(409).json({
        success: false,
        error: row.status === "scheduled" ? "The teacher has not started this class yet" : "This class is not active",
      });
    }
    if (Date.now() < new Date(row.scheduled_start).getTime() - joinWindowMinutes * 60_000) {
      return res.status(409).json({ success: false, error: "This class is not open yet" });
    }

    const attendance = await query(
      "INSERT INTO live_class_attendance (live_class_id, user_id, role) VALUES ($1, $2, $3) RETURNING *",
      [req.params.id, actor.id, actor.role],
    );
    const participants = await query(
      `SELECT DISTINCT ON (a.user_id)
         a.user_id,
         u.full_name,
         a.role
       FROM live_class_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.live_class_id = $1 AND a.left_at IS NULL
       ORDER BY a.user_id, a.joined_at DESC`,
      [req.params.id],
    );

    res.json({
      success: true,
      data: {
        live_class: { ...row, ...state },
        attendance: attendance.rows[0],
        participants: participants.rows,
        room: {
          room_id: row.room_id,
          meeting_id: row.meeting_id,
          signaling_url: `/api/live-classes/${req.params.id}/join`,
        },
      },
      message: "Live class joined successfully",
    });
  } catch (error) {
    console.error("Error joining live class:", error);
    res.status(500).json({
      success: false,
      error: "Failed to join live class",
    });
  }
};

export const leaveLiveClass: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    const { attendance_id } = req.body;
    if (!attendance_id) {
      return res.status(400).json({
        success: false,
        error: "Attendance id is required",
      });
    }

    const result = await query(
      `UPDATE live_class_attendance
       SET left_at = CURRENT_TIMESTAMP,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at))::int)
         WHERE id = $1 AND user_id = $2 AND left_at IS NULL
       RETURNING *`,
        [attendance_id, actor.id],
    );

    res.json({
      success: true,
      data: result.rows[0] || null,
      message: "Live class left successfully",
    });
  } catch (error) {
    console.error("Error leaving live class:", error);
    res.status(500).json({
      success: false,
      error: "Failed to leave live class",
    });
  }
};

/** Creates a short-lived Zoom Video SDK JWT. The SDK secret never leaves the server. */
export const createVideoSdkToken: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;
    const { id } = req.params;
    const sdkKey = process.env.ZOOM_VIDEO_SDK_KEY;
    const sdkSecret = process.env.ZOOM_VIDEO_SDK_SECRET;

    if (!sdkKey || !sdkSecret) {
      return res.status(503).json({
        success: false,
        error: "Zoom Video SDK is not configured. Add ZOOM_VIDEO_SDK_KEY and ZOOM_VIDEO_SDK_SECRET to the server environment.",
      });
    }
    if (!["teacher", "student", "admin"].includes(actor.role)) {
      return res.status(403).json({ success: false, error: "Live class access required." });
    }

    const liveClass = await query(`${liveClassSelect} WHERE lc.id = $1`, [id]);
    if (liveClass.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Live class not found." });
    }
    const row = liveClass.rows[0];
    if (actor.role === "teacher" && !canManageClass(actor, row)) {
      return res.status(403).json({ success: false, error: "Only the assigned teacher can host this meeting." });
    }
    if (actor.role === "student" && !(await isEnrolled(actor.id, row.course_id))) {
      return res.status(403).json({ success: false, error: "Only enrolled students can join this meeting." });
    }
    if (!classIsActive(row) || Date.now() < new Date(row.scheduled_start).getTime() - joinWindowMinutes * 60_000) {
      return res.status(409).json({ success: false, error: "This class is not active or is outside its scheduled window." });
    }

    const now = Math.floor(Date.now() / 1000);
    const topic = String(row.meeting_id || row.room_id);
    const token = jwt.sign(
      {
        app_key: sdkKey,
        role_type: actor.role === "teacher" ? 1 : 0,
        tpc: topic,
        user_identity: String(actor.id),
        version: 1,
        iat: now,
        exp: now + 60 * 60,
      },
      sdkSecret,
      { algorithm: "HS256" },
    );

    res.json({
      success: true,
      data: { token, topic, role: actor.role === "teacher" ? 1 : 0 },
      message: "Zoom Video SDK token generated successfully.",
    });
  } catch (error) {
    console.error("Error generating Zoom Video SDK token:", error);
    res.status(500).json({ success: false, error: "Unable to authorize Zoom Video SDK." });
  }
};
