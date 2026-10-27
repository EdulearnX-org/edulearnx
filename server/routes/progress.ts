import { RequestHandler } from "express";
import { query } from "../db/connection.js";
import { canAccessCourse, canAccessStudentData } from "../utils/studentDataAccess.js";

// Get lesson progress for a student
export const getStudentProgress: RequestHandler = async (req, res) => {
  try {
    const { student_id } = req.params;
    const { course_id } = req.query;
    if (typeof student_id !== "string") {
      return res.status(400).json({ success: false, error: "Invalid student id" });
    }
    const actor = req.user;
    if (
      !actor ||
      !(await canAccessStudentData(
        actor,
        student_id,
        typeof course_id === "string" ? course_id : undefined,
      ))
    ) {
      return res.status(403).json({ success: false, error: "Student progress access required" });
    }

    let queryStr = `
      SELECT 
        lp.*,
        cl.title AS lesson_title,
        cl.content_type,
        cl.duration_minutes,
        cm.title AS module_title,
        c.title AS course_title
      FROM lesson_progress lp
      INNER JOIN course_lessons cl ON cl.id = lp.lesson_id
      INNER JOIN course_modules cm ON cm.id = cl.module_id
      INNER JOIN courses c ON c.id = cm.course_id
      WHERE lp.student_id = $1
    `;
    const params: any[] = [student_id];

    if (course_id) {
      queryStr += ` AND cm.course_id = $${params.length + 1}`;
      params.push(course_id);
    }

    queryStr += " ORDER BY cm.order_index ASC, cl.order_index ASC";

    const result = await query(queryStr, params);

    res.json({
      success: true,
      data: result.rows,
      message: "Student progress fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching student progress:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch student progress",
    });
  }
};

// Update or create lesson progress
export const updateLessonProgress: RequestHandler = async (req, res) => {
  try {
    const { student_id, lesson_id } = req.params;
    if (typeof student_id !== "string" || typeof lesson_id !== "string") {
      return res.status(400).json({ success: false, error: "Invalid progress target" });
    }
    const { is_completed, progress_percentage, last_watched_at } = req.body;

    if (
      (is_completed !== undefined && typeof is_completed !== "boolean") ||
      (progress_percentage !== undefined &&
        (typeof progress_percentage !== "number" ||
          !Number.isFinite(progress_percentage) ||
          progress_percentage < 0 ||
          progress_percentage > 100)) ||
      (last_watched_at !== undefined &&
        (typeof last_watched_at !== "string" ||
          !Number.isFinite(Date.parse(last_watched_at)) ||
          Date.parse(last_watched_at) > Date.now()))
    ) {
      return res.status(400).json({ success: false, error: "Invalid lesson progress values" });
    }

    const lesson = await query(
      `SELECT cm.course_id
       FROM course_lessons cl
       JOIN course_modules cm ON cm.id = cl.module_id
       WHERE cl.id = $1`,
      [lesson_id],
    );
    if (!lesson.rows[0]) {
      return res.status(404).json({ success: false, error: "Lesson not found" });
    }

    if (
      !req.user ||
      !(await canAccessStudentData(req.user, student_id, lesson.rows[0].course_id))
    ) {
      return res.status(403).json({ success: false, error: "Student progress access required" });
    }

    const result = await query(
      `INSERT INTO lesson_progress (
         student_id, lesson_id, is_completed, progress_percentage, last_watched_at, completed_at
       )
       VALUES ($1, $2, COALESCE($3, false), COALESCE($4, 0), COALESCE($5, CURRENT_TIMESTAMP),
               CASE WHEN $3 = true THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON CONFLICT (student_id, lesson_id) DO UPDATE
       SET is_completed = COALESCE($3, lesson_progress.is_completed),
           progress_percentage = COALESCE($4, lesson_progress.progress_percentage),
           last_watched_at = COALESCE($5, CURRENT_TIMESTAMP),
           completed_at = CASE
             WHEN $3 = true THEN COALESCE(lesson_progress.completed_at, CURRENT_TIMESTAMP)
             WHEN $3 = false THEN NULL
             ELSE lesson_progress.completed_at
           END,
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        student_id,
        lesson_id,
        is_completed ?? null,
        progress_percentage ?? null,
        last_watched_at ?? null,
      ],
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: "Lesson progress updated successfully",
    });
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update lesson progress",
    });
  }
};

// Get overall course progress for a student
export const getCourseProgress: RequestHandler = async (req, res) => {
  try {
    const { student_id, course_id } = req.params;
    if (typeof student_id !== "string" || typeof course_id !== "string") {
      return res.status(400).json({ success: false, error: "Invalid progress target" });
    }
    if (
      !req.user ||
      !(await canAccessStudentData(req.user, student_id, course_id))
    ) {
      return res.status(403).json({ success: false, error: "Student progress access required" });
    }

    const result = await query(
      `
      SELECT 
        c.id AS course_id,
        c.title AS course_title,
        COUNT(DISTINCT cl.id) AS total_lessons,
        COUNT(DISTINCT CASE WHEN lp.is_completed = true THEN cl.id END) AS completed_lessons,
        ROUND(
          CASE 
            WHEN COUNT(DISTINCT cl.id) = 0 THEN 0
            ELSE (COUNT(DISTINCT CASE WHEN lp.is_completed = true THEN cl.id END)::numeric / COUNT(DISTINCT cl.id)::numeric) * 100
          END,
          2
        ) AS progress_percentage,
        e.enrolled_at,
        e.is_completed AS course_completed,
        e.completed_at
      FROM courses c
      LEFT JOIN course_modules cm ON cm.course_id = c.id
      LEFT JOIN course_lessons cl ON cl.module_id = cm.id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = cl.id AND lp.student_id = $1
      LEFT JOIN enrollments e ON e.course_id = c.id AND e.student_id = $1
      WHERE c.id = $2
      GROUP BY c.id, c.title, e.enrolled_at, e.is_completed, e.completed_at
      `,
      [student_id, course_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course not found or student not enrolled",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Course progress fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching course progress:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course progress",
    });
  }
};

// Mark enrollment as completed
export const completeCourse: RequestHandler = async (req, res) => {
  try {
    const { student_id, course_id } = req.params;
    if (typeof student_id !== "string" || typeof course_id !== "string") {
      return res.status(400).json({ success: false, error: "Invalid progress target" });
    }
    if (
      !req.user ||
      !(await canAccessStudentData(req.user, student_id, course_id))
    ) {
      return res.status(403).json({ success: false, error: "Student progress access required" });
    }

    const result = await query(
      `UPDATE enrollments 
       SET is_completed = true, 
           completed_at = CURRENT_TIMESTAMP,
           progress_percentage = 100
       WHERE student_id = $1 AND course_id = $2
         AND EXISTS (
           SELECT 1
           FROM course_modules cm
           JOIN course_lessons cl ON cl.module_id = cm.id
           WHERE cm.course_id = $2
         )
         AND NOT EXISTS (
           SELECT 1
           FROM course_modules cm
           JOIN course_lessons cl ON cl.module_id = cm.id
           LEFT JOIN lesson_progress lp
             ON lp.lesson_id = cl.id AND lp.student_id = $1
           WHERE cm.course_id = $2 AND COALESCE(lp.is_completed, false) = false
         )
       RETURNING *`,
      [student_id, course_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Enrollment not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Course marked as completed",
    });
  } catch (error) {
    console.error("Error completing course:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete course",
    });
  }
};

// Get all modules and lessons for a course (with progress)
export const getCourseStructure: RequestHandler = async (req, res) => {
  try {
    const { course_id } = req.params;
    if (typeof course_id !== "string") {
      return res.status(400).json({ success: false, error: "Invalid course id" });
    }
    const actor = req.user;
    if (!actor) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const access = await canAccessCourse(actor, course_id);
    if (!access) {
      return res.status(403).json({ success: false, error: "Course access required" });
    }
    const course = await query("SELECT id FROM courses WHERE id = $1", [course_id]);
    if (!course.rows[0]) {
      return res.status(404).json({ success: false, error: "Course not found" });
    }

    const modulesResult = await query(
      `SELECT * FROM course_modules WHERE course_id = $1 ORDER BY order_index ASC`,
      [course_id]
    );

    const moduleIds = modulesResult.rows.map((module) => module.id);
    const lessonsResult = moduleIds.length
      ? await query(
          `SELECT * FROM course_lessons
           WHERE module_id = ANY($1)
           ${access === "preview" ? "AND is_preview = true" : ""}
           ORDER BY order_index ASC`,
          [moduleIds],
        )
      : { rows: [] };
    const progressStudentId = access === "preview"
      ? undefined
      : actor.role === "student"
        ? actor.userId
        : typeof req.query.student_id === "string"
          ? req.query.student_id
          : undefined;
    let progressMap = new Map();
    if (progressStudentId !== undefined) {
      if (
        !(await canAccessStudentData(
          actor,
          progressStudentId,
          course_id,
        ))
      ) {
        return res.status(403).json({ success: false, error: "Student progress access required" });
      }
      const progressResult = await query(
        `SELECT lp.lesson_id, lp.is_completed, lp.progress_percentage
         FROM lesson_progress lp
         JOIN course_lessons cl ON cl.id = lp.lesson_id
         JOIN course_modules cm ON cm.id = cl.module_id
         WHERE lp.student_id = $1 AND cm.course_id = $2`,
        [progressStudentId, course_id],
      );
      progressMap = new Map(
        progressResult.rows.map((progress) => [progress.lesson_id, progress]),
      );
    }

    const lessonsByModule = new Map<number, typeof lessonsResult.rows>();
    for (const lesson of lessonsResult.rows) {
      const lessons = lessonsByModule.get(lesson.module_id) ?? [];
      lessons.push({
        ...lesson,
        ...(progressMap.has(lesson.id) ? { progress: progressMap.get(lesson.id) } : {}),
      });
      lessonsByModule.set(lesson.module_id, lessons);
    }
    const modules = modulesResult.rows.map((module) => ({
      ...module,
      lessons: lessonsByModule.get(module.id) ?? [],
    }));

    res.json({
      success: true,
      data: modules,
      message: "Course structure fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching course structure:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course structure",
    });
  }
};

// Create a module
export const createModule: RequestHandler = async (req, res) => {
  try {
    const { course_id, title, description, order_index } = req.body;

    if (!course_id || !title || order_index === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: course_id, title, order_index",
      });
    }

    const result = await query(
      "INSERT INTO course_modules (course_id, title, description, order_index) VALUES ($1, $2, $3, $4) RETURNING *",
      [course_id, title, description || null, order_index]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Module created successfully",
    });
  } catch (error) {
    console.error("Error creating module:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create module",
    });
  }
};

// Update a module
export const updateModule: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, order_index } = req.body;

    const result = await query(
      "UPDATE course_modules SET title = COALESCE($1, title), description = COALESCE($2, description), order_index = COALESCE($3, order_index), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *",
      [title || null, description || null, order_index !== undefined ? order_index : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Module not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Module updated successfully",
    });
  } catch (error) {
    console.error("Error updating module:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update module",
    });
  }
};

// Delete a module
export const deleteModule: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM course_modules WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Module not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Module deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting module:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete module",
    });
  }
};

// Create a lesson
export const createLesson: RequestHandler = async (req, res) => {
  try {
    const { module_id, title, content_type, content_text, video_url, duration_minutes, order_index, is_preview } = req.body;

    if (!module_id || !title || !content_type || order_index === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: module_id, title, content_type, order_index",
      });
    }

    const result = await query(
      "INSERT INTO course_lessons (module_id, title, content_type, content_text, video_url, duration_minutes, order_index, is_preview) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [module_id, title, content_type, content_text || null, video_url || null, duration_minutes || null, order_index, is_preview || false]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Lesson created successfully",
    });
  } catch (error) {
    console.error("Error creating lesson:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create lesson",
    });
  }
};

// Update a lesson
export const updateLesson: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content_type, content_text, video_url, duration_minutes, order_index, is_preview } = req.body;

    const result = await query(
      "UPDATE course_lessons SET title = COALESCE($1, title), content_type = COALESCE($2, content_type), content_text = COALESCE($3, content_text), video_url = COALESCE($4, video_url), duration_minutes = COALESCE($5, duration_minutes), order_index = COALESCE($6, order_index), is_preview = COALESCE($7, is_preview), updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *",
      [title || null, content_type || null, content_text || null, video_url || null, duration_minutes || null, order_index !== undefined ? order_index : null, is_preview !== undefined ? is_preview : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Lesson not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "Lesson updated successfully",
    });
  } catch (error) {
    console.error("Error updating lesson:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update lesson",
    });
  }
};

// Delete a lesson
export const deleteLesson: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query("DELETE FROM course_lessons WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Lesson not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "Lesson deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete lesson",
    });
  }
};
