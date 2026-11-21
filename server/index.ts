// Load .env BEFORE any database/route imports (ES module evaluation order)
import "./env.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo.js";
import { initializeDatabase } from "./db/schema.js";
import { isDatabaseConfigured, query } from "./db/connection.js";
import { initializeAuthSchema } from "./db/authSchema.js";
import { initializeContactSchema } from "./db/contactSchema.js";
import { initializeRepairSchema } from "./db/repairSchema.js";
import { maintenanceHandler } from "./utils/maintenance.js";
import { createUploadIntent } from "./routes/uploads.js";
import { submitContactMessage } from "./routes/contact.js";
import * as authRoutes from "./routes/auth.js";
import * as userRoutes from "./routes/users.js";
import * as courseRoutes from "./routes/courses.js";
import * as courseZoomRoutes from "./routes/courseZoom.js";
import * as statsRoutes from "./routes/stats.js";
import * as enrollmentRequestRoutes from "./routes/enrollmentRequests.js";
import * as tutorApplicationRoutes from "./routes/tutorApplications.js";
import * as categoryRoutes from "./routes/categories.js";
import * as tagRoutes from "./routes/tags.js";
import * as progressRoutes from "./routes/progress.js";
import * as liveClassRoutes from "./routes/liveClasses.js";
import * as paymentSettingsRoutes from "./routes/paymentSettings.js";
import * as rewardRoutes from "./routes/rewards.js";
import * as adminPermissionRoutes from "./routes/adminPermissions.js";
import * as dealsRoutes from "./routes/deals.js";
import { requireAuth, optionalAuth } from "./utils/authMiddleware.js";
import {
  requireAdminFeature,
  requireAdminSelfOrUserManagement,
  requirePrimaryAdmin,
} from "./utils/adminPermissionMiddleware.js";

const shouldInitializeDatabase =
  !process.env.VERCEL &&
  process.env.NODE_ENV !== "test" &&
  (process.env.NODE_ENV !== "production" ||
    process.env.INITIALIZE_DATABASE_ON_STARTUP === "true");
let initializationPromise: Promise<void> | undefined;

type JsonResponse = {
  status(code: number): {
    json(body: unknown): unknown;
  };
};

function sendJson(res: unknown, status: number, body: unknown) {
  return (res as JsonResponse).status(status).json(body);
}

export function initializeServer() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (process.env.NODE_ENV === "production" && !isDatabaseConfigured) {
        throw new Error("DATABASE_URL must be configured in production.");
      }
      if (shouldInitializeDatabase) {
        await initializeDatabase();
        await initializeAuthSchema();
        await initializeContactSchema();
        await initializeRepairSchema();
      }
      if (
        process.env.NODE_ENV === "production" &&
        !(await hasRequiredSchema())
      ) {
        throw new Error("Database schema is not initialized. Apply production migrations before startup.");
      }
    })();
  }
  return initializationPromise;
}

// Keep this list in sync with schema changes used by authentication and the core flows.
export const requiredSchemaColumns: Record<string, readonly string[]> = {
  users: ["id", "email", "password_hash", "full_name", "role", "is_active", "admin_permissions", "two_factor_enabled", "two_factor_secret_enc", "two_factor_pending_secret_enc", "two_factor_required_at", "two_factor_defer_used"],
  courses: ["id", "instructor_id", "price_cents", "is_published", "meeting_id", "zoom_link"],
  enrollments: ["student_id", "course_id", "class_time_slot", "progress_percentage", "is_completed"],
  auth_sessions: ["token_hash", "user_id", "expires_at"],
  password_reset_tokens: ["token_hash", "user_id", "created_by", "expires_at"],
  contact_messages: ["id", "name", "email", "subject", "message"],
  live_classes: ["id", "course_id", "teacher_id", "status", "scheduled_start", "scheduled_end", "ended_at"],
  live_class_attendance: ["live_class_id", "user_id", "joined_at", "left_at", "duration_seconds"],
  tutor_applications: ["id", "email", "password_hash", "status", "certificate_1", "certificate_2", "certificate_3"],
  class_schedule_batches: ["actor_id", "request_id", "request_hash", "class_ids"],
  upload_intents: ["id", "token_hash", "owner_id", "purpose", "bucket", "object_path", "content_type", "byte_size", "status", "expires_at"],
  request_limits: ["key_hash", "attempts", "expires_at"],
  app_migrations: ["version"],
};

export async function hasRequiredSchema() {
  const result = await query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [Object.keys(requiredSchemaColumns)],
  );
  const columns = new Set(result.rows.map(row => `${row.table_name}.${row.column_name}`));
  for (const [table, requiredColumns] of Object.entries(requiredSchemaColumns)) {
    if (requiredColumns.some(column => !columns.has(`${table}.${column}`))) return false;
  }
  const migration = await query("SELECT 1 FROM app_migrations WHERE version = $1", ["20261031_audit_repairs"]);
  return migration.rows.length > 0;
}

function getCorsOrigin() {
  const configured = process.env.CORS_ORIGIN;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      // Same-origin deployments need no cross-origin response headers.
      return false;
    }
    return true;
  }

  const origins = configured.split(",").map((value) => value.trim());
  if (origins.some((origin) => !origin || origin === "*")) {
    throw new Error("CORS_ORIGIN must be a comma-separated list of explicit origins.");
  }
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CORS_ORIGIN contains an invalid origin.");
    }
    if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("CORS_ORIGIN entries must be exact HTTP or HTTPS origins.");
    }
  }
  return origins;
}

export function createServer() {
  const app = express();
  // Middleware
  app.use(
    cors({
      origin: getCorsOrigin(),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "32kb", parameterLimit: 100 }));

  const apiRouter = express.Router();

  apiRouter.get("/internal/maintenance", maintenanceHandler);
  apiRouter.post("/uploads", optionalAuth, createUploadIntent);

  apiRouter.get("/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "pong";
    res.json({ success: true, message: ping });
  });

  apiRouter.get("/demo", handleDemo);
  apiRouter.post("/contact", submitContactMessage);
  apiRouter.use("/auth", authRoutes.authRouter);
  apiRouter.get("/admin/permissions/me", requireAuth, adminPermissionRoutes.getMyPermissions);
  apiRouter.get("/deals/bundles", optionalAuth, dealsRoutes.getBundles);
  apiRouter.get("/deals/promo-codes", requireAuth, requireAdminFeature("deals"), dealsRoutes.getPromoCodes);
  apiRouter.post("/deals/bundles", requireAuth, requireAdminFeature("deals"), dealsRoutes.createBundle);
  apiRouter.patch("/deals/bundles/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.updateBundle);
  apiRouter.delete("/deals/bundles/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.deleteBundle);
  apiRouter.post("/deals/promo-codes", requireAuth, requireAdminFeature("deals"), dealsRoutes.createPromoCode);
  apiRouter.patch("/deals/promo-codes/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.updatePromoCode);
  apiRouter.delete("/deals/promo-codes/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.deletePromoCode);
  apiRouter.get("/admin/co-admins", requireAuth, requirePrimaryAdmin, adminPermissionRoutes.getCoAdmins);
  apiRouter.put("/admin/co-admins/:id", requireAuth, requirePrimaryAdmin, adminPermissionRoutes.updateCoAdminPermissions);
  apiRouter.get("/public-stats", statsRoutes.getPublicStats);
  apiRouter.get("/platform-stats", requireAuth, requireAdminFeature("overview"), statsRoutes.getPlatformStats);
  apiRouter.get("/students/:id/rewards", requireAuth, rewardRoutes.getStudentRewards);

  apiRouter.get("/users", requireAuth, requireAdminFeature("users"), userRoutes.getUsers);
  apiRouter.get("/users/:id", requireAuth, requireAdminSelfOrUserManagement, userRoutes.getUserById);
  apiRouter.post("/users", requireAuth, requireAdminFeature("users"), userRoutes.createUser);
  apiRouter.put("/users/:id", requireAuth, requireAdminSelfOrUserManagement, userRoutes.updateUser);
  apiRouter.delete("/users/:id", requireAuth, requireAdminFeature("users"), userRoutes.deleteUser);

  apiRouter.get("/courses", optionalAuth, courseRoutes.getCourses);
  apiRouter.get("/course-zoom-links", requireAuth, courseZoomRoutes.getCourseZoomLinks);
  apiRouter.patch("/courses/:id/zoom-link", requireAuth, courseZoomRoutes.updateCourseZoomLink);
  apiRouter.get("/instructors", requireAuth, requireAdminFeature("courses"), async (_req, res) => {
    try {
      const result = await query("SELECT id, full_name FROM users WHERE role = 'teacher' AND is_active = true ORDER BY full_name");
      res.json({ success: true, data: result.rows });
    } catch {
      res.status(500).json({ success: false, error: "Unable to load instructors" });
    }
  });
  apiRouter.get("/courses/:id", optionalAuth, courseRoutes.getCourseById);
  apiRouter.post("/courses", requireAuth, requireAdminFeature("courses"), courseRoutes.createCourse);
  apiRouter.put("/courses/:id", requireAuth, requireAdminFeature("courses"), courseRoutes.updateCourse);
  apiRouter.delete("/courses/:id", requireAuth, requireAdminFeature("courses"), courseRoutes.deleteCourse);

  apiRouter.get("/enrollments", requireAuth, courseRoutes.getEnrollments);
  apiRouter.post("/enrollments", requireAuth, courseRoutes.enrollStudent);
  apiRouter.patch("/enrollments/:id/time-slot", requireAuth, courseRoutes.updateEnrollmentTimeSlot);
  apiRouter.delete("/enrollments/:id", requireAuth, requireAdminFeature("enrollmentRequests"), courseRoutes.deleteEnrollment);
  apiRouter.get("/enrollment-requests", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.getEnrollmentRequests);
  apiRouter.post("/enrollment-requests", requireAuth, enrollmentRequestRoutes.createEnrollmentRequest);
  apiRouter.get("/enrollment-requests/:id/status", requireAuth, enrollmentRequestRoutes.getMyEnrollmentStatus);
  apiRouter.get("/enrollment-requests/:id/receipt", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.getEnrollmentReceiptUrl);
  apiRouter.post("/enrollment-requests/:id/retry-cleanup", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.retryEnrollmentRequestCleanup);
  apiRouter.patch("/enrollment-requests/:id", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.reviewEnrollmentRequest);
  apiRouter.get("/tutor-applications", requireAuth, requireAdminFeature("tutorApplications"), tutorApplicationRoutes.getTutorApplications);
  apiRouter.post("/tutor-applications", tutorApplicationRoutes.createTutorApplication);
  apiRouter.get("/tutor-applications/:id/certificates/:slot", requireAuth, requireAdminFeature("tutorApplications"), tutorApplicationRoutes.getTutorCertificate);
  apiRouter.patch("/tutor-applications/:id", requireAuth, requireAdminFeature("tutorApplications"), tutorApplicationRoutes.reviewTutorApplication);

  // Categories routes
  apiRouter.get("/categories", categoryRoutes.getCategories);
  apiRouter.get("/categories/:slug", categoryRoutes.getCategoryBySlug);
  apiRouter.post("/categories", requireAuth, requireAdminFeature("courses"), categoryRoutes.createCategory);
  apiRouter.put("/categories/:id", requireAuth, requireAdminFeature("courses"), categoryRoutes.updateCategory);
  apiRouter.delete("/categories/:id", requireAuth, requireAdminFeature("courses"), categoryRoutes.deleteCategory);
  apiRouter.post("/course-categories", requireAuth, requireAdminFeature("courses"), categoryRoutes.assignCategoryToCourse);
  apiRouter.delete("/courses/:course_id/categories/:category_id", requireAuth, requireAdminFeature("courses"), categoryRoutes.removeCategoryFromCourse);
  apiRouter.get("/courses/:course_id/categories", categoryRoutes.getCategoriesForCourse);

  // Tags routes
  apiRouter.get("/tags", tagRoutes.getTags);
  apiRouter.get("/tags/:slug", tagRoutes.getTagBySlug);
  apiRouter.post("/tags", requireAuth, requireAdminFeature("courses"), tagRoutes.createTag);
  apiRouter.put("/tags/:id", requireAuth, requireAdminFeature("courses"), tagRoutes.updateTag);
  apiRouter.delete("/tags/:id", requireAuth, requireAdminFeature("courses"), tagRoutes.deleteTag);
  apiRouter.post("/course-tags", requireAuth, requireAdminFeature("courses"), tagRoutes.assignTagToCourse);
  apiRouter.delete("/courses/:course_id/tags/:tag_id", requireAuth, requireAdminFeature("courses"), tagRoutes.removeTagFromCourse);
  apiRouter.get("/courses/:course_id/tags", tagRoutes.getTagsForCourse);

  // Progress tracking routes
  apiRouter.get("/progress/student/:student_id", requireAuth, progressRoutes.getStudentProgress);
  apiRouter.get("/progress/course/:course_id/student/:student_id", requireAuth, progressRoutes.getCourseProgress);
  apiRouter.patch("/progress/lesson/:lesson_id/student/:student_id", requireAuth, progressRoutes.updateLessonProgress);
  apiRouter.post("/progress/complete-course/:course_id/student/:student_id", requireAuth, progressRoutes.completeCourse);
  apiRouter.get("/courses/:course_id/structure", requireAuth, progressRoutes.getCourseStructure);

  apiRouter.get("/live-classes", requireAuth, liveClassRoutes.getLiveClasses);
  apiRouter.post("/live-classes/batch", requireAuth, liveClassRoutes.createClassBatch);
  apiRouter.post("/live-classes", requireAuth, liveClassRoutes.createLiveClass);
  apiRouter.put("/live-classes/:id", requireAuth, liveClassRoutes.updateLiveClass);
  apiRouter.delete("/live-classes/:id", requireAuth, liveClassRoutes.deleteLiveClass);
  apiRouter.post("/live-classes/:id/start", requireAuth, liveClassRoutes.startLiveClass);
  apiRouter.post("/live-classes/:id/end", requireAuth, liveClassRoutes.endLiveClass);
  apiRouter.get("/live-classes/:id/status", requireAuth, liveClassRoutes.getLiveClassStatus);
  apiRouter.post("/live-classes/:id/join", requireAuth, liveClassRoutes.joinLiveClass);
  apiRouter.post("/live-classes/:id/video-sdk-token", requireAuth, liveClassRoutes.createVideoSdkToken);
  apiRouter.post("/live-classes/:id/leave", requireAuth, liveClassRoutes.leaveLiveClass);

  apiRouter.get("/payment-settings", paymentSettingsRoutes.getPaymentSettings);
  apiRouter.put("/payment-settings", requireAuth, requireAdminFeature("settings"), paymentSettingsRoutes.updatePaymentSettings);

  // Course modules and lessons management
  apiRouter.post("/modules", requireAuth, requireAdminFeature("courses"), progressRoutes.createModule);
  apiRouter.put("/modules/:id", requireAuth, requireAdminFeature("courses"), progressRoutes.updateModule);
  apiRouter.delete("/modules/:id", requireAuth, requireAdminFeature("courses"), progressRoutes.deleteModule);
  apiRouter.post("/lessons", requireAuth, requireAdminFeature("courses"), progressRoutes.createLesson);
  apiRouter.put("/lessons/:id", requireAuth, requireAdminFeature("courses"), progressRoutes.updateLesson);
  apiRouter.delete("/lessons/:id", requireAuth, requireAdminFeature("courses"), progressRoutes.deleteLesson);

  apiRouter.get("/keep-alive", async (_req, res) => {
    const start = Date.now();
    try {
      if (!isDatabaseConfigured) {
        return res.status(503).json({
          success: false,
          latencyMs: Date.now() - start,
          error: "Database is not configured",
        });
      }
      await query("SELECT 1");
      return res.json({ success: true, latencyMs: Date.now() - start });
    } catch (error) {
      console.error("Database keep-alive failed:", error);
      return res.status(503).json({
        success: false,
        latencyMs: Date.now() - start,
        error: "Database is temporarily unavailable",
      });
    }
  });

  apiRouter.get("/health", async (_req, res) => {
    try {
      if (!isDatabaseConfigured || !(await hasRequiredSchema())) {
        return res.status(503).json({
          success: false,
          status: "unavailable",
          timestamp: new Date().toISOString(),
        });
      }
      return res.json({ success: true, status: "ready", timestamp: new Date().toISOString() });
    } catch (error) {
      console.error("Readiness check failed:", error);
      return res.status(503).json({
        success: false,
        status: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  apiRouter.get("/health-db", async (_req, res) => {
    const start = Date.now();
    try {
      if (!isDatabaseConfigured || !(await hasRequiredSchema())) {
        return res.status(503).json({
          success: false,
          latencyMs: Date.now() - start,
          error: "Database is not ready",
        });
      }
      res.json({ success: true, latencyMs: Date.now() - start });
    } catch (error) {
      console.error("Database health check failed:", error);
      res.status(500).json({
        success: false,
        latencyMs: Date.now() - start,
        error: "Database is temporarily unavailable",
      });
    }
  });

  app.use("/api", apiRouter);

  app.use("/api", (_req, res) => {
    sendJson(res, 404, { success: false, error: "Route not found" });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    const candidate = error as { status?: number; statusCode?: number } | undefined;
    const status = candidate?.status ?? candidate?.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const message = status === 413 ? "Request body is too large" : "Invalid request body";
      res.status(status).json({ success: false, error: message });
      return;
    }
    console.error("Unexpected server error:", error);
    res.status(500).json({ success: false, error: "Unexpected server error" });
  };
  app.use(errorHandler);

  return app;
}
