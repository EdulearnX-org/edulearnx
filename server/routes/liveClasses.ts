import { Request, Response, RequestHandler } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction } from "../utils/transaction.js";
import { HttpError, respondError } from "../utils/errors.js";
import { idSchema, instantSchema } from "../../shared/validation.js";
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

const scheduleSchema = z.object({
  course_id: idSchema, teacher_id: idSchema.nullable().optional(),
  title: z.string().trim().min(1).max(255), description: z.string().trim().max(10000).nullable().optional(),
  scheduled_start: instantSchema, scheduled_end: instantSchema,
}).strict();
function validateWindow(start: string | Date, end: string | Date) {
  if (!Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime()) || new Date(start)>=new Date(end)) throw new HttpError(400,"End time must be after start time");
}
async function validateAssignment(client: PoolClient, actor: any, values: any) {
  const course=(await client.query("SELECT id,instructor_id FROM courses WHERE id=$1 FOR UPDATE",[values.course_id])).rows[0];
  if (!course) throw new HttpError(404,"Course not found");
  if (actor.role==="teacher" && String(course.instructor_id)!==String(actor.id)) throw new HttpError(403,"You can only schedule your assigned courses");
  const teacher=actor.role==="teacher" ? actor.id : values.teacher_id ?? course.instructor_id;
  if (!teacher || !(await client.query("SELECT id FROM users WHERE id=$1 AND role='teacher' AND is_active IS DISTINCT FROM FALSE FOR SHARE",[teacher])).rows.length) throw new HttpError(400,"Choose an active teacher");
  return teacher;
}
async function insertClass(client: PoolClient, values: any, teacher: unknown) {
  validateWindow(values.scheduled_start,values.scheduled_end);
  return (await client.query(`INSERT INTO live_classes(course_id,teacher_id,title,description,scheduled_start,scheduled_end,room_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[values.course_id,teacher,values.title,values.description || null,values.scheduled_start,values.scheduled_end,roomId()])).rows[0];
}
async function closeExpired(client: PoolClient, courseId: unknown) {
  await client.query(`UPDATE live_class_attendance a SET left_at=lc.scheduled_end,
    duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM(lc.scheduled_end-a.joined_at))::int)
    FROM live_classes lc WHERE a.live_class_id=lc.id AND a.left_at IS NULL
    AND lc.course_id=$1 AND lc.status='active' AND lc.scheduled_end<CURRENT_TIMESTAMP`,[courseId]);
  await client.query(`UPDATE live_classes SET status='completed',ended_at=scheduled_end,updated_at=CURRENT_TIMESTAMP
    WHERE course_id=$1 AND status='active' AND scheduled_end<CURRENT_TIMESTAMP`,[courseId]);
}
export async function expireCourseClasses(courseId: unknown) {
  await transaction(async client => {
    await client.query("SELECT id FROM courses WHERE id=$1 FOR UPDATE",[courseId]);
    await closeExpired(client,courseId);
  });
}

export const getLiveClasses: RequestHandler = async (req, res) => {
  try {
    const actor = await getActor(req, res);
    if (!actor) return;

    const { course_id, teacher_id, student_id } = req.query;
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
      params.push(idSchema.parse(course_id));
      where.push(`lc.course_id = $${params.length}`);
    }

    if (teacher_id) {
      params.push(idSchema.parse(teacher_id)); where.push(`lc.teacher_id=$${params.length}`);
    }
    if (student_id) {
      const student=idSchema.parse(student_id);
      if (actor.role === "student" && student !== String(actor.id)) throw new HttpError(403,"You may only view your classes");
      params.push(student); where.push(`EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=lc.course_id AND e.student_id=$${params.length})`);
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
    return respondError(res,error,"Failed to fetch live classes");
  }
};

export const createLiveClass: RequestHandler = async(req,res) => {
  try {
    const actor=await getActor(req,res); if (!actor) return;
    if (!["teacher","admin"].includes(actor.role)) throw new HttpError(403,"Teacher access required");
    const values=scheduleSchema.parse(req.body);
    const created=await transaction(async client => insertClass(client,values,await validateAssignment(client,actor,values)));
    return res.status(201).json({success:true,data:withJoinState([created])[0]});
  } catch(error) { return respondError(res,error,"Unable to schedule class"); }
};

export const createClassBatch: RequestHandler = async(req,res) => {
  try {
    const actor=await getActor(req,res); if (!actor) return;
    if (!["teacher","admin"].includes(actor.role)) throw new HttpError(403,"Teacher access required");
    const input=scheduleSchema.omit({scheduled_start:true,scheduled_end:true}).extend({
      request_id:z.uuid(), sessions:z.array(z.object({scheduled_start:instantSchema,scheduled_end:instantSchema}).strict()).length(5),
    }).parse(req.body);
    const {request_id,sessions,...details}=input;
    sessions.forEach(session=>validateWindow(session.scheduled_start,session.scheduled_end));
    if (new Set(sessions.map(session=>session.scheduled_start)).size!==sessions.length) throw new HttpError(400,"Choose distinct class times");
    const hash=crypto.createHash("sha256").update(JSON.stringify({details,sessions})).digest("hex");
    const result=await transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[String(actor.id),request_id]);
      const previous=(await client.query("SELECT request_hash,class_ids FROM class_schedule_batches WHERE actor_id=$1 AND request_id=$2",[String(actor.id),request_id])).rows[0];
      if (previous) {
        if (previous.request_hash!==hash) throw new HttpError(409,"This scheduling request was already used for different classes");
        return {class_ids:previous.class_ids,replayed:true};
      }
      const teacher=await validateAssignment(client,actor,details);
      const ids=[];
      for (const session of sessions) ids.push((await insertClass(client,{...details,...session},teacher)).id);
      await client.query("INSERT INTO class_schedule_batches(actor_id,request_id,request_hash,class_ids) VALUES($1,$2,$3,$4::jsonb)",[String(actor.id),request_id,hash,JSON.stringify(ids)]);
      return {class_ids:ids,replayed:false};
    });
    return res.status(result.replayed ? 200 : 201).json({success:true,data:result});
  } catch(error) { return respondError(res,error,"Unable to schedule classes"); }
};

export const updateLiveClass: RequestHandler = async(req,res) => {
  try {
    const actor=await getActor(req,res); if (!actor) return;
    if (actor.role!=="admin") throw new HttpError(403,"Admin access required");
    const id=idSchema.parse(req.params.id);
    const patch=scheduleSchema.partial().extend({status:z.enum(["scheduled","cancelled","completed"]).optional()}).parse(req.body);
    const updated=await transaction(async client => {
      const current=(await client.query("SELECT * FROM live_classes WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if (!current) throw new HttpError(404,"Live class not found");
      if (current.status!=="scheduled" && Object.keys(patch).some(key=>key!=="status")) throw new HttpError(409,"Only scheduled classes can be edited");
      if (current.status!=="scheduled" && patch.status==="scheduled") throw new HttpError(409,"Create a new class instead of reopening an ended class");
      const values={...current,...patch};validateWindow(values.scheduled_start,values.scheduled_end);
      const teacher=await validateAssignment(client,actor,values);
      if (current.status==="active" && ["completed","cancelled"].includes(values.status)) await client.query(`UPDATE live_class_attendance SET left_at=CURRENT_TIMESTAMP,duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM(CURRENT_TIMESTAMP-joined_at))::int) WHERE live_class_id=$1 AND left_at IS NULL`,[id]);
      return (await client.query(`UPDATE live_classes SET course_id=$1,teacher_id=$2,title=$3,description=$4,scheduled_start=$5,scheduled_end=$6,status=$7,
        ended_at=CASE WHEN $7 IN ('completed','cancelled') THEN COALESCE(ended_at,CURRENT_TIMESTAMP) ELSE ended_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING *`,
        [values.course_id,teacher,values.title,values.description || null,values.scheduled_start,values.scheduled_end,values.status,id])).rows[0];
    });
    return res.json({success:true,data:withJoinState([updated])[0]});
  } catch(error) { return respondError(res,error,"Unable to update class"); }
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
    await expireCourseClasses(row.course_id);
    if (row.status === "active" && Date.now() <= new Date(row.scheduled_end).getTime()) {
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

    const started = await transaction(async client => {
      await client.query("SELECT id FROM courses WHERE id=$1 FOR UPDATE",[row.course_id]);
      await closeExpired(client,row.course_id);
      const current=(await client.query(`${liveClassSelect} WHERE lc.id=$1 FOR UPDATE OF lc`,[req.params.id])).rows[0];
      if(!current || String(current.course_id)!==String(row.course_id) || !canManageClass(actor,current)) throw new HttpError(409,"Class assignment changed. Reload before starting.");
      if(Date.now()<new Date(current.scheduled_start).getTime()-joinWindowMinutes*60_000 || Date.now()>new Date(current.scheduled_end).getTime()) throw new HttpError(409,"This class is outside its scheduled start window");
      return client.query(
      `UPDATE live_classes
       SET status = 'active', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'scheduled'
       RETURNING *`,
      [req.params.id],
    );
    });
    if (started.rows.length === 0) {
      return res.status(409).json({ success: false, error: "This class is already active or has ended" });
    }
    res.json({ success: true, data: withJoinState(started.rows)[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, error: "Another class for this course is already active" });
    }
    respondError(res,error,"Unable to start live class");
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

    const ended=await transaction(async client=>{
      await client.query("SELECT id FROM courses WHERE id=$1 FOR UPDATE",[row.course_id]);
      const current=(await client.query(`${liveClassSelect} WHERE lc.id=$1 FOR UPDATE OF lc`,[req.params.id])).rows[0];
      if(!current || !canManageClass(actor,current)) throw new HttpError(409,"Class assignment changed. Reload before ending.");
      await client.query(`UPDATE live_class_attendance SET left_at=LEAST(CURRENT_TIMESTAMP,$2::timestamp),duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM(LEAST(CURRENT_TIMESTAMP,$2::timestamp)-joined_at))::int) WHERE live_class_id=$1 AND left_at IS NULL`,[req.params.id,current.scheduled_end]);
      return client.query(`UPDATE live_classes SET status='completed',ended_at=LEAST(CURRENT_TIMESTAMP,scheduled_end),updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='active' RETURNING *`,[req.params.id]);
    });
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
    const expired = row.status === "active" && Date.now() > new Date(row.scheduled_end).getTime();
    if (expired) await expireCourseClasses(row.course_id);
    const status = expired ? "completed" : row.status;
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
