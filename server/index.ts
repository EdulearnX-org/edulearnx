// Load .env BEFORE any database/route imports (ES module evaluation order)
import "./env.js";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo.js";
import { initializeDatabase } from "./db/schema.js";
import { isDatabaseConfigured, query } from "./db/connection.js";
import { initializeAuthSchema } from "./db/authSchema.js";
import { initializeContactSchema } from "./db/contactSchema.js";
import { submitContactMessage } from "./routes/contact.js";
import * as authRoutes from "./routes/auth.js";
import * as userRoutes from "./routes/users.js";
import * as courseRoutes from "./routes/courses.js";
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
import { requireAuth } from "./utils/authMiddleware.js";
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
let enrollmentCleanupTimer: NodeJS.Timeout | undefined;

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

async function hasRequiredSchema() {
  const result = await query(
    `SELECT to_regclass('public.users') AS users_table,
            to_regclass('public.courses') AS courses_table,
            to_regclass('public.auth_sessions') AS sessions_table,
            to_regclass('public.password_reset_tokens') AS reset_tokens_table,
            to_regclass('public.contact_messages') AS contact_messages_table`,
  );
  const tables = result.rows[0];
  return Boolean(tables?.users_table && tables?.courses_table && tables?.sessions_table && tables?.reset_tokens_table && tables?.contact_messages_table);
}

function getCorsOrigin() {
  const configured = process.env.CORS_ORIGIN;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CORS_ORIGIN must be configured in production.");
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
  const hasSupabaseServerKey = Boolean(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  if (
    !enrollmentCleanupTimer &&
    process.env.NODE_ENV !== "test" &&
    hasSupabaseServerKey &&
    hasSupabaseUrl
  ) {
    enrollmentCleanupTimer = setInterval(() => {
      enrollmentRequestRoutes.retryEnrollmentReceiptCleanup().catch((error) => {
        console.error("Automatic enrollment receipt cleanup retry failed:", error);
      });
    }, 60_000);
    enrollmentCleanupTimer.unref();
  }

  const app = express();
  // Middleware
  app.use(
    cors({
      origin: getCorsOrigin(),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "32kb", parameterLimit: 100 }));

  const apiRouter = express.Router();

  // Keep-alive endpoint to prevent Neon database cold starts
  apiRouter.get("/keep-alive", async (_req, res) => {
    try {
      const start = Date.now();
      await query("SELECT 1 AS keep_alive");
      const latency = Date.now() - start;
      
      res.json({
        success: true,
        message: "Database keep-alive successful",
        latency_ms: latency,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Keep-alive failed:", error);
      res.status(500).json({
        success: false,
        error: "Database is temporarily unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  apiRouter.get("/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "pong";
    res.json({ success: true, message: ping });
  });

  apiRouter.get("/demo", handleDemo);
  apiRouter.post("/contact", submitContactMessage);
  apiRouter.use("/auth", authRoutes.authRouter);
  apiRouter.get("/admin/permissions/me", requireAuth, adminPermissionRoutes.getMyPermissions);
  apiRouter.get("/deals/bundles", dealsRoutes.getBundles);
  apiRouter.get("/deals/promo-codes", requireAuth, requireAdminFeature("deals"), dealsRoutes.getPromoCodes);
  apiRouter.post("/deals/bundles", requireAuth, requireAdminFeature("deals"), dealsRoutes.createBundle);
  apiRouter.patch("/deals/bundles/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.updateBundle);
  apiRouter.delete("/deals/bundles/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.deleteBundle);
  apiRouter.post("/deals/promo-codes", requireAuth, requireAdminFeature("deals"), dealsRoutes.createPromoCode);
  apiRouter.patch("/deals/promo-codes/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.updatePromoCode);
  apiRouter.delete("/deals/promo-codes/:id", requireAuth, requireAdminFeature("deals"), dealsRoutes.deletePromoCode);
  apiRouter.get("/admin/co-admins", requireAuth, requirePrimaryAdmin, adminPermissionRoutes.getCoAdmins);
  apiRouter.put("/admin/co-admins/:id", requireAuth, requirePrimaryAdmin, adminPermissionRoutes.updateCoAdminPermissions);
  apiRouter.get("/platform-stats", requireAuth, requireAdminFeature("overview"), statsRoutes.getPlatformStats);
  apiRouter.get("/students/:id/rewards", requireAuth, rewardRoutes.getStudentRewards);

  apiRouter.get("/users", requireAuth, requireAdminFeature("users"), userRoutes.getUsers);
  apiRouter.get("/users/:id", requireAuth, requireAdminSelfOrUserManagement, userRoutes.getUserById);
  apiRouter.post("/users", requireAuth, requireAdminFeature("users"), userRoutes.createUser);
  apiRouter.put("/users/:id", requireAuth, requireAdminSelfOrUserManagement, userRoutes.updateUser);
  apiRouter.delete("/users/:id", requireAuth, requireAdminFeature("users"), userRoutes.deleteUser);

  apiRouter.get("/courses", courseRoutes.getCourses);
  apiRouter.get("/instructors", requireAuth, requireAdminFeature("courses"), async (_req, res) => {
    try {
      const result = await query("SELECT id, full_name FROM users WHERE role = 'teacher' AND is_active = true ORDER BY full_name");
      res.json({ success: true, data: result.rows });
    } catch {
      res.status(500).json({ success: false, error: "Unable to load instructors" });
    }
  });
  apiRouter.get("/courses/:id", courseRoutes.getCourseById);
  apiRouter.post("/courses", requireAuth, requireAdminFeature("courses"), courseRoutes.createCourse);
  apiRouter.put("/courses/:id", requireAuth, requireAdminFeature("courses"), courseRoutes.updateCourse);
  apiRouter.delete("/courses/:id", requireAuth, requireAdminFeature("courses"), courseRoutes.deleteCourse);

  apiRouter.get("/enrollments", requireAuth, courseRoutes.getEnrollments);
  apiRouter.post("/enrollments", requireAuth, courseRoutes.enrollStudent);
  apiRouter.delete("/enrollments/:id", requireAuth, requireAdminFeature("enrollmentRequests"), courseRoutes.deleteEnrollment);
  apiRouter.get("/enrollment-requests", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.getEnrollmentRequests);
  apiRouter.post("/enrollment-requests", requireAuth, enrollmentRequestRoutes.createEnrollmentRequest);
  apiRouter.get("/enrollment-requests/:id/receipt", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.getEnrollmentReceiptUrl);
  apiRouter.post("/enrollment-requests/:id/retry-cleanup", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.retryEnrollmentRequestCleanup);
  apiRouter.patch("/enrollment-requests/:id", requireAuth, requireAdminFeature("enrollmentRequests"), enrollmentRequestRoutes.reviewEnrollmentRequest);
  apiRouter.get("/tutor-applications", requireAuth, requireAdminFeature("tutorApplications"), tutorApplicationRoutes.getTutorApplications);
  apiRouter.post("/tutor-applications", tutorApplicationRoutes.createTutorApplication);
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

  app.use((err: unknown, _req: unknown, res: unknown, _next: unknown) => {
    console.error("Unexpected server error:", err);
    sendJson(res, 500, { success: false, error: "Unexpected server error" });
  });

  return app;
}
