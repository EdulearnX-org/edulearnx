import path from "node:path";
import dotenv from "dotenv";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import express, { Router } from "express";
import cors from "cors";
import { Pool } from "pg";
import { Pool as Pool$1, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { z } from "zod";
import crypto$1 from "node:crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
// server/env.ts
if (!process.env.VERCEL) dotenv.config({ path: [".env.local", ".env"] });
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());
// server/routes/demo.ts
var handleDemo = (req, res) => {
	res.status(200).json({ message: "Hello from Express server" });
};
// server/db/connection.ts
var connectionString = process.env.DATABASE_URL ?? "";
var isDatabaseConfigured = Boolean(connectionString);
function usesNeonTransport(url) {
	try {
		return new URL(url).hostname.toLowerCase().endsWith(".neon.tech");
	} catch {
		return false;
	}
}
function webSocketProxy(url) {
	const target = new URL(url);
	return (process.env.no_proxy || process.env.NO_PROXY || "").split(/[\s,]+/).some((entry) => {
		if (!entry) return false;
		if (entry === "*") return true;
		const [hostname, port] = entry.toLowerCase().split(":");
		if (port && port !== (target.port || "443")) return false;
		const domain = hostname.replace(/^\*?\./, "");
		return target.hostname.toLowerCase() === domain || (hostname.startsWith(".") || hostname.startsWith("*.")) && target.hostname.toLowerCase().endsWith(`.${domain}`);
	}) ? void 0 : process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
}
var CloudWebSocket = class extends WebSocket {
	constructor(address, protocols, options) {
		const proxy = webSocketProxy(String(address));
		super(address, protocols, {
			...options,
			...proxy ? { agent: new HttpsProxyAgent(proxy) } : {}
		});
	}
};
var options = {
	connectionString: connectionString || void 0,
	max: 10,
	idleTimeoutMillis: 3e4,
	connectionTimeoutMillis: 1e4,
	ssl: connectionString ? { rejectUnauthorized: true } : void 0
};
var pool;
if (usesNeonTransport(connectionString)) {
	neonConfig.webSocketConstructor = CloudWebSocket;
	neonConfig.poolQueryViaFetch = false;
	pool = new Pool$1(options);
} else pool = new Pool(options);
pool.on("error", (error) => {
	console.error("Database pool error:", error.code || error.name);
});
async function query(text, params) {
	return pool.query(text, params);
}
var connection_default = pool;
// server/db/schema.ts
async function getColumnType(tableName, columnName, fallback) {
	const result = await query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `, [tableName, columnName]);
	if (result.rows.length === 0) return fallback;
	const { data_type, udt_name } = result.rows[0];
	return data_type === "USER-DEFINED" ? String(udt_name).toUpperCase() : String(data_type).toUpperCase();
}
async function initializeDatabase() {
	if (!isDatabaseConfigured) {
		console.warn("DATABASE_URL is not configured; database routes will be unavailable.");
		return;
	}
	try {
		const userRefType = await getColumnType("users", "id", "INTEGER") === "UUID" ? "UUID" : "INTEGER";
		const courseRefType = await getColumnType("courses", "id", "INTEGER") === "UUID" ? "UUID" : "INTEGER";
		await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        profile_image_url TEXT,
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions JSONB NOT NULL DEFAULT '{}'::jsonb");
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);`);
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);`);
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;`);
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`);
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`);
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_token_hash VARCHAR(255);`);
		await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_expires_at TIMESTAMP;`);
		await query(`
      UPDATE users
      SET full_name = COALESCE(full_name, name, email)
      WHERE full_name IS NULL;
    `);
		await query(`
      UPDATE users
      SET is_active = true
      WHERE is_active IS NULL;
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        instructor_id ${userRefType} REFERENCES users(id) ON DELETE SET NULL,
        category VARCHAR(100),
        duration_weeks INTEGER,
        start_date DATE,
        end_date DATE,
        thumbnail_url TEXT,
        meeting_id VARCHAR(32) UNIQUE,
        price_cents INTEGER NOT NULL DEFAULT 0,
        is_published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(32);`);
		await query(`
      UPDATE courses
      SET meeting_id = CONCAT(
        'ELX-',
        UPPER(SUBSTRING(MD5(random()::text || id::text || clock_timestamp()::text), 1, 10))
      )
      WHERE meeting_id IS NULL;
    `);
		await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_meeting_id ON courses(meeting_id);`);
		if ((await query("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'price_cents'")).rows.length === 0) {
			await query("ALTER TABLE courses ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0");
			console.log("Added price_cents column to courses table.");
		}
		await query(`
      UPDATE courses
      SET meeting_id = CONCAT(
        'ELX-',
        UPPER(SUBSTRING(MD5(random()::text || id::text || clock_timestamp()::text), 1, 10))
      )
      WHERE meeting_id IS NULL;
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        progress_percentage FLOAT DEFAULT 0,
        is_completed BOOLEAN DEFAULT false,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        UNIQUE(student_id, course_id)
      );
    `);
		await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS user_id ${userRefType};`);
		await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS student_id ${userRefType} REFERENCES users(id) ON DELETE CASCADE;`);
		await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS progress_percentage FLOAT DEFAULT 0;`);
		await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;`);
		await query(`
      UPDATE enrollments
      SET student_id = user_id
      WHERE student_id IS NULL
        AND user_id IS NOT NULL;
    `);
		await query(`
      UPDATE enrollments
      SET progress_percentage = 0
      WHERE progress_percentage IS NULL;
    `);
		if ((await query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'status'
    `)).rows.length > 0) await query(`
        UPDATE enrollments
        SET is_completed = (status = 'completed')
        WHERE is_completed IS NULL;
      `);
		await query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date TIMESTAMP,
        created_by ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submission_text TEXT,
        file_url TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        grade INTEGER,
        feedback TEXT,
        graded_at TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        created_by ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        course_id ${courseRefType} REFERENCES courses(id) ON DELETE CASCADE,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        attendance_date DATE,
        is_present BOOLEAN DEFAULT false,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS enrollment_requests (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        screenshot_data_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by ${userRefType} REFERENCES users(id) ON DELETE SET NULL
      );
    `);
		await query(`ALTER TABLE enrollment_requests ALTER COLUMN screenshot_data_url DROP NOT NULL;`);
		await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS transfer_reference VARCHAR(255);`);
		await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS receipt_data_url TEXT;`);
		await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS sender_account_title VARCHAR(255);`);
		await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS sender_account_number VARCHAR(255);`);
		await query(`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        bank_name VARCHAR(255) NOT NULL DEFAULT '',
        account_name VARCHAR(255) NOT NULL DEFAULT '',
        account_number VARCHAR(255) NOT NULL DEFAULT '',
        iban VARCHAR(255) NOT NULL DEFAULT '',
        routing_code VARCHAR(255) NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`INSERT INTO payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_id ${userRefType} REFERENCES users(id) ON DELETE SET NULL;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(100);`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration_weeks INTEGER;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS start_date DATE;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS end_date DATE;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
		await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
		await query(`CREATE TABLE IF NOT EXISTS bundle_deals (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0), starts_at TIMESTAMP,
      ends_at TIMESTAMP, is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
		await query(`CREATE TABLE IF NOT EXISTS bundle_deal_courses (
      bundle_id INTEGER NOT NULL REFERENCES bundle_deals(id) ON DELETE CASCADE,
      course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      PRIMARY KEY (bundle_id, course_id)
    );`);
		await query(`CREATE TABLE IF NOT EXISTS promo_codes (
      id SERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL,
      discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      discount_value INTEGER NOT NULL CHECK (discount_value > 0), starts_at TIMESTAMP,
      ends_at TIMESTAMP, max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
      redemption_count INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
		await query(`
      CREATE TABLE IF NOT EXISTS tutor_applications (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        expertise VARCHAR(255) NOT NULL,
        experience_years INTEGER DEFAULT 0,
        portfolio_url TEXT,
        certificate_1 TEXT,
        certificate_2 TEXT,
        certificate_3 TEXT,
        bio TEXT NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by ${userRefType} REFERENCES users(id) ON DELETE SET NULL
      );
    `);
		await query(`ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS certificate_1 TEXT;`);
		await query(`ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS certificate_2 TEXT;`);
		await query(`ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS certificate_3 TEXT;`);
		await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS course_categories (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(course_id, category_id)
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS course_tags (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(course_id, tag_id)
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS course_modules (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS course_lessons (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'text', 'quiz', 'interactive')),
        content_text TEXT,
        video_url TEXT,
        duration_minutes INTEGER,
        order_index INTEGER NOT NULL,
        is_preview BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS lesson_progress (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
        is_completed BOOLEAN DEFAULT false,
        progress_percentage FLOAT DEFAULT 0,
        last_watched_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, lesson_id)
      );
    `);
		await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS user_id ${userRefType};`);
		await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS student_id ${userRefType} REFERENCES users(id) ON DELETE CASCADE;`);
		await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS progress_percentage FLOAT DEFAULT 0;`);
		await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;`);
		await query(`
      CREATE TABLE IF NOT EXISTS live_classes (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        teacher_id ${userRefType} REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        scheduled_start TIMESTAMP NOT NULL,
        scheduled_end TIMESTAMP NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed')),
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        room_id VARCHAR(120) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
		await query(`ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;`);
		await query(`ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP;`);
		await query(`ALTER TABLE live_classes DROP CONSTRAINT IF EXISTS live_classes_status_check;`);
		await query(`
      ALTER TABLE live_classes
      ADD CONSTRAINT live_classes_status_check
      CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed'));
    `);
		await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_live_classes_one_active_per_course
      ON live_classes(course_id)
      WHERE status = 'active';
    `);
		await query(`
      CREATE TABLE IF NOT EXISTS live_class_attendance (
        id SERIAL PRIMARY KEY,
        live_class_id INTEGER NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
        user_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0
      );
    `);
		await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_enrollment_requests_status ON enrollment_requests(status);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_enrollment_requests_student ON enrollment_requests(student_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_enrollment_requests_course ON enrollment_requests(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_tutor_applications_status ON tutor_applications(status);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_tutor_applications_email ON tutor_applications(email);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_course_categories_course ON course_categories(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_course_categories_category ON course_categories(category_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_course_tags_course ON course_tags(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_course_tags_tag ON course_tags(tag_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON course_lessons(module_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_lesson_progress_student ON lesson_progress(student_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_live_classes_course ON live_classes(course_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_live_classes_teacher ON live_classes(teacher_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_live_classes_start ON live_classes(scheduled_start);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_live_class_attendance_class ON live_class_attendance(live_class_id);`);
		await query(`CREATE INDEX IF NOT EXISTS idx_live_class_attendance_user ON live_class_attendance(user_id);`);
		console.log("Database schema initialized successfully");
	} catch (error) {
		console.error("Error initializing database schema:", error);
		throw error;
	}
}
// server/db/authSchema.ts
var authSchemaSql = `-- Apply after the core users table exists. If case-insensitive duplicate emails
-- exist, resolve them explicitly before applying this index; never merge roles automatically.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
-- Text user IDs support both legacy integer and UUID users tables.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Older application schemas require an audit creator. Preserve every existing
-- creator; backfill self-service ownership only where this field is absent/null.
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS created_by TEXT;
UPDATE password_reset_tokens SET created_by=user_id WHERE created_by IS NULL;
ALTER TABLE password_reset_tokens ALTER COLUMN created_by SET NOT NULL;
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
COMMIT;`;
/** Requires users to exist; production must apply the migration before startup. */
async function initializeAuthSchema() {
	if (!isDatabaseConfigured) return;
	const client = await connection_default.connect();
	try {
		await client.query(authSchemaSql);
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
// server/db/contactSchema.ts
var contactSchemaSql = `CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(320) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;
async function initializeContactSchema() {
	if (isDatabaseConfigured) await query(contactSchemaSql);
}
// server/routes/contact.ts
var schema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().trim().toLowerCase().email().max(320),
	subject: z.string().trim().min(1).max(200),
	message: z.string().trim().min(1).max(1e4)
});
var attempts$1 = /* @__PURE__ */ new Map();
var submitContactMessage = async (req, res) => {
	const parsed = schema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({
			success: false,
			error: "Enter a name, valid email, subject, and message (at most 10,000 characters)."
		});
		return;
	}
	const now = Date.now();
	for (const [key, value] of attempts$1) if (value.expires <= now) attempts$1.delete(key);
	const key = req.ip || "unknown";
	const attempt = attempts$1.get(key) || {
		count: 0,
		expires: now + 9e5
	};
	if (attempt.count >= 5) {
		res.status(429).json({
			success: false,
			error: "Please wait before sending another message."
		});
		return;
	}
	attempt.count += 1;
	attempts$1.set(key, attempt);
	try {
		const { name, email, subject, message } = parsed.data;
		await query("INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)", [
			name,
			email,
			subject,
			message
		]);
		res.status(201).json({
			success: true,
			message: "Your message has been received."
		});
	} catch (error) {
		console.error("Unable to save contact message", error);
		res.status(503).json({
			success: false,
			error: "Unable to send your message. Please try again or email team@edulearnx.org."
		});
	}
};
// server/utils/api.ts
function sendSuccess(res, data, message = "Success", status = 200) {
	return res.status(status).json({
		success: true,
		message,
		data
	});
}
function sendError(res, error, status = 500) {
	return res.status(status).json({
		success: false,
		error
	});
}
// server/utils/authMiddleware.ts
function hashAuthToken(token) {
	return crypto$1.createHash("sha256").update(token).digest("hex");
}
function readSessionToken(req) {
	let token = req.cookies?.auth_token;
	if (!token) {
		const cookie = req.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("auth_token="));
		if (cookie) try {
			token = decodeURIComponent(cookie.slice(11));
		} catch {
			return;
		}
	}
	return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : void 0;
}
async function requireAuth(req, res, next) {
	const token = readSessionToken(req);
	if (!token) return sendError(res, "Authentication required", 401);
	try {
		const user = (await query(`SELECT u.id, u.email, u.role, u.is_active
       FROM auth_sessions s JOIN users u ON u.id::text = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP
         AND u.is_active IS DISTINCT FROM FALSE`, [hashAuthToken(token)])).rows[0];
		if (!user || user.is_active === false) return sendError(res, "Invalid or expired session", 401);
		req.user = {
			userId: user.id,
			email: user.email,
			role: user.role
		};
		return next();
	} catch {
		return sendError(res, "Unable to verify account", 503);
	}
}
// server/utils/password.ts
var BCRYPT_ROUNDS = 12;
function isValidPassword(password) {
	return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}
async function hashPassword(password) {
	if (Buffer.byteLength(password, "utf8") > 72) throw new Error("Password must not exceed 72 UTF-8 bytes.");
	return bcrypt.hash(password, BCRYPT_ROUNDS);
}
/** Supports existing bcrypt and SHA256 hashes; upgrade SHA256 after successful login. */
async function verifyPassword(password, storedHash) {
	if (!storedHash || typeof storedHash !== "string") return false;
	if (storedHash.startsWith("$2")) {
		if (Buffer.byteLength(password, "utf8") > 72) return false;
		return bcrypt.compare(password, storedHash);
	}
	if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
	const expected = Buffer.from(storedHash, "hex");
	const actual = crypto$1.createHash("sha256").update(password).digest();
	return crypto$1.timingSafeEqual(actual, expected);
}
function isLegacyHash(storedHash) {
	return /^[a-f0-9]{64}$/i.test(storedHash);
}
// server/routes/auth.ts
var emailSchema = z.string().trim().toLowerCase().email().max(255);
var passwordSchema = z.string().refine(isValidPassword, "Use at least 8 characters and at most 72 UTF-8 bytes.");
var loginSchema = z.object({
	email: emailSchema,
	password: z.string().min(1).max(1024)
});
var registerSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
	full_name: z.string().trim().min(1).max(255)
});
var resetSchema = z.object({
	token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
	password: passwordSchema
});
var profileColumns = "id, email, full_name, role, profile_image_url, phone, is_active";
var SESSION_MS = 6048e5;
var RESET_MS = 18e5;
function publicProfile(user) {
	const { id, email, full_name, role, profile_image_url, phone, is_active } = user;
	return {
		id,
		email,
		full_name,
		role,
		profile_image_url,
		phone,
		is_active
	};
}
function setAuthCookie(res, token) {
	res.cookie("auth_token", token, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/api",
		maxAge: SESSION_MS
	});
}
function clearAuthCookie(res) {
	res.clearCookie("auth_token", {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/api"
	});
}
async function createSession(client, userId) {
	const token = crypto$1.randomBytes(32).toString("base64url");
	await client.query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
		hashAuthToken(token),
		String(userId),
		new Date(Date.now() + SESSION_MS)
	]);
	return token;
}
async function transaction(fn) {
	const client = await connection_default.connect();
	try {
		await client.query("BEGIN");
		const result = await fn(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}
var AuthFailure = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.status = status;
	}
};
function fail(res, error, fallback) {
	return sendError(res, error instanceof AuthFailure ? error.message : fallback, error instanceof AuthFailure ? error.status : 503);
}
var attempts = /* @__PURE__ */ new Map();
function rateLimit(scope, limit, duration) {
	return (req, res, next) => {
		const now = Date.now();
		if (attempts.size > 2e4) {
			for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
		}
		if (attempts.size > 3e4) return sendError(res, "Too many requests. Try again later.", 429);
		const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
		const keys = [`${scope}:ip:${req.ip || "unknown"}`];
		if (rawEmail) keys.push(`${scope}:email:${hashAuthToken(rawEmail)}`);
		for (const key of keys) {
			let entry = attempts.get(key);
			if (!entry || entry.expires <= now) {
				entry = {
					count: 0,
					expires: now + duration
				};
				attempts.set(key, entry);
			}
			if (entry.count >= limit) {
				res.setHeader("Retry-After", String(Math.ceil((entry.expires - now) / 1e3)));
				return sendError(res, "Too many requests. Try again later.", 429);
			}
		}
		keys.forEach((key) => {
			attempts.get(key).count += 1;
		});
		next();
	};
}
var register = async (req, res) => {
	const parsed = registerSchema.safeParse(req.body);
	if (!parsed.success) return sendError(res, "Provide a valid name, email, and password (8 characters minimum; 72 UTF-8 bytes maximum).", 400);
	try {
		const passwordHash = await hashPassword(parsed.data.password);
		const result = await transaction(async (client) => {
			const user = (await client.query(`INSERT INTO users (email,password_hash,full_name,name,role)
         VALUES ($1,$2,$3,$3,'student') ON CONFLICT DO NOTHING RETURNING ${profileColumns}`, [
				parsed.data.email,
				passwordHash,
				parsed.data.full_name
			])).rows[0];
			if (!user) throw new AuthFailure("An account already exists for this email. Sign in or reset its password.", 409);
			return {
				user,
				token: await createSession(client, user.id)
			};
		});
		setAuthCookie(res, result.token);
		return sendSuccess(res, publicProfile(result.user), "Account created", 201);
	} catch (error) {
		return fail(res, error, "Unable to create your account.");
	}
};
var login = async (req, res) => {
	const parsed = loginSchema.safeParse(req.body);
	if (!parsed.success) return sendError(res, "Email and password are required.", 400);
	try {
		const result = await transaction(async (client) => {
			const existing = await client.query(`SELECT ${profileColumns}, password_hash FROM users WHERE lower(email)=$1 FOR UPDATE`, [parsed.data.email]);
			const user = existing.rows.length === 1 ? existing.rows[0] : void 0;
			if (!user || user.is_active === false || !await verifyPassword(parsed.data.password, user.password_hash)) {
				if (!user) await hashPassword("unknown-account-timing-padding");
				throw new AuthFailure("Invalid email or password.", 401);
			}
			if (isLegacyHash(user.password_hash) && Buffer.byteLength(parsed.data.password, "utf8") <= 72) {
				const upgraded = await hashPassword(parsed.data.password);
				await client.query("UPDATE users SET password_hash=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [upgraded, user.id]);
			}
			const prior = readSessionToken(req);
			if (prior) await client.query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashAuthToken(prior)]);
			return {
				user,
				token: await createSession(client, user.id)
			};
		});
		setAuthCookie(res, result.token);
		return sendSuccess(res, publicProfile(result.user), "Signed in");
	} catch (error) {
		return fail(res, error, "Unable to sign in.");
	}
};
var getSession = async (req, res) => {
	try {
		const result = await query(`SELECT ${profileColumns} FROM users WHERE id=$1 AND is_active IS DISTINCT FROM FALSE`, [req.user?.userId]);
		if (!result.rows[0]) {
			clearAuthCookie(res);
			return sendError(res, "Invalid or expired session", 401);
		}
		res.setHeader("Cache-Control", "no-store");
		return sendSuccess(res, publicProfile(result.rows[0]), "Session loaded");
	} catch {
		return sendError(res, "Unable to load auth session", 503);
	}
};
var logout = async (req, res) => {
	try {
		const token = readSessionToken(req);
		if (token) await query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashAuthToken(token)]);
		clearAuthCookie(res);
		return sendSuccess(res, null, "Signed out");
	} catch {
		return sendError(res, "Unable to revoke your session. Please retry.", 503);
	}
};
function mailConfig() {
	const { SMTP_HOST, SMTP_FROM, SMTP_USER, SMTP_PASSWORD, APP_URL } = process.env;
	const port = Number(process.env.SMTP_PORT || 587);
	if (!SMTP_HOST || !SMTP_FROM || !APP_URL || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD)) throw new AuthFailure("Password reset email is not configured. Contact support.", 503);
	let app;
	try {
		app = new URL(APP_URL);
	} catch {
		throw new AuthFailure("Password reset email is not configured. Contact support.", 503);
	}
	if (!["https:", "http:"].includes(app.protocol) || app.username || app.password || app.protocol !== "https:") throw new AuthFailure("Password reset email is not configured. Contact support.", 503);
	const secure = process.env.SMTP_SECURE === "true" || !process.env.SMTP_SECURE && port === 465;
	return {
		transporter: nodemailer.createTransport({
			host: SMTP_HOST,
			port,
			secure,
			requireTLS: !secure && ![
				"localhost",
				"127.0.0.1",
				"::1"
			].includes(SMTP_HOST),
			auth: SMTP_USER && SMTP_PASSWORD ? {
				user: SMTP_USER,
				pass: SMTP_PASSWORD
			} : void 0,
			connectionTimeout: 1e4,
			greetingTimeout: 1e4,
			socketTimeout: 15e3
		}),
		from: SMTP_FROM,
		appOrigin: app.origin
	};
}
var forgotPassword = async (req, res) => {
	const parsed = emailSchema.safeParse(req.body?.email);
	if (!parsed.success) return sendError(res, "Provide a valid email address.", 400);
	let issuedHash;
	try {
		const mail = mailConfig();
		const result = await transaction(async (client) => {
			const existing = await client.query("SELECT id FROM users WHERE lower(email)=$1 AND is_active IS DISTINCT FROM FALSE FOR UPDATE", [parsed.data]);
			if (existing.rows.length !== 1) return null;
			const token = crypto$1.randomBytes(32).toString("base64url");
			issuedHash = hashAuthToken(token);
			await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [String(existing.rows[0].id)]);
			await client.query("INSERT INTO password_reset_tokens (token_hash,user_id,expires_at,created_by) VALUES ($1,$2,$3,$4)", [
				issuedHash,
				String(existing.rows[0].id),
				new Date(Date.now() + RESET_MS),
				String(existing.rows[0].id)
			]);
			return token;
		});
		if (result) await mail.transporter.sendMail({
			from: mail.from,
			to: parsed.data,
			subject: "Reset your EduLearnX password",
			text: `Use this link to reset your EduLearnX password within 30 minutes:\n\n${mail.appOrigin}/reset-password?token=${encodeURIComponent(result)}\n\nIf you did not request this, you can ignore this email.`
		});
		return sendSuccess(res, null, "If an active account exists, a password reset email has been sent.");
	} catch (error) {
		if (issuedHash) try {
			await query("DELETE FROM password_reset_tokens WHERE token_hash=$1", [issuedHash]);
		} catch {}
		return fail(res, error, "Unable to send password reset email. Please try again later.");
	}
};
var resetPassword = async (req, res) => {
	const parsed = resetSchema.safeParse(req.body);
	if (!parsed.success) return sendError(res, "Provide a valid reset token and a password of 8 characters minimum (72 UTF-8 bytes maximum).", 400);
	try {
		const passwordHash = await hashPassword(parsed.data.password);
		await transaction(async (client) => {
			const found = await client.query(`SELECT u.id FROM password_reset_tokens t JOIN users u ON u.id::text=t.user_id
         WHERE t.token_hash=$1 AND t.expires_at>CURRENT_TIMESTAMP AND u.is_active IS DISTINCT FROM FALSE FOR UPDATE OF u,t`, [hashAuthToken(parsed.data.token)]);
			if (!found.rows[0]) throw new AuthFailure("Reset link is invalid or expired. Request a new one.", 400);
			const userId = found.rows[0].id;
			await client.query("UPDATE users SET password_hash=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2", [passwordHash, userId]);
			await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [String(userId)]);
			await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [String(userId)]);
		});
		clearAuthCookie(res);
		return sendSuccess(res, null, "Password reset. Sign in with your new password.");
	} catch (error) {
		return fail(res, error, "Unable to reset your password.");
	}
};
var changePassword = async (req, res) => {
	const parsed = z.object({
		current_password: z.string().min(1).max(1024),
		password: passwordSchema
	}).safeParse(req.body);
	if (!parsed.success) return sendError(res, "Provide your current password and a new password of 8 characters minimum (72 UTF-8 bytes maximum).", 400);
	try {
		const result = await transaction(async (client) => {
			const user = (await client.query(`SELECT ${profileColumns},password_hash FROM users WHERE id=$1 AND is_active IS DISTINCT FROM FALSE FOR UPDATE`, [req.user?.userId])).rows[0];
			if (!user || !await verifyPassword(parsed.data.current_password, user.password_hash)) throw new AuthFailure("Current password is incorrect.", 401);
			await client.query("UPDATE users SET password_hash=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2", [await hashPassword(parsed.data.password), user.id]);
			await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [String(user.id)]);
			await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [String(user.id)]);
			return {
				user,
				token: await createSession(client, user.id)
			};
		});
		setAuthCookie(res, result.token);
		return sendSuccess(res, publicProfile(result.user), "Password changed. Other sessions have been signed out.");
	} catch (error) {
		return fail(res, error, "Unable to change your password.");
	}
};
var authRouter = Router();
authRouter.use((req, res, next) => {
	res.setHeader("Cache-Control", "no-store");
	if (req.method !== "GET" && req.method !== "HEAD") {
		const origin = req.headers.origin;
		if (origin) try {
			const parsed = new URL(origin);
			const configured = process.env.APP_URL ? new URL(process.env.APP_URL).origin : void 0;
			if (parsed.host !== req.get("host") && parsed.origin !== configured) return sendError(res, "Request origin is not allowed.", 403);
		} catch {
			return sendError(res, "Request origin is not allowed.", 403);
		}
		if (req.path !== "/logout" && !req.is("application/json")) return sendError(res, "Use application/json for authentication requests.", 415);
	}
	next();
});
authRouter.post("/register", rateLimit("register", 10, 36e5), register);
authRouter.post("/login", rateLimit("login", 20, 9e5), login);
authRouter.get("/session", requireAuth, getSession);
authRouter.post("/logout", logout);
authRouter.post("/forgot-password", rateLimit("forgot-password", 5, 36e5), forgotPassword);
authRouter.post("/reset-password", rateLimit("reset-password", 20, 9e5), resetPassword);
authRouter.post("/change-password", rateLimit("change-password", 20, 9e5), requireAuth, changePassword);
// shared/adminPermissions.ts
var PRIMARY_ADMIN_EMAILS = [
	"team@edulearnx.ibi",
	"team@edulearnx.abdur",
	"abdur@admin.raheem"
];
PRIMARY_ADMIN_EMAILS[0];
var ADMIN_FEATURES = [
	{
		key: "overview",
		label: "Dashboard overview"
	},
	{
		key: "users",
		label: "Students and teachers"
	},
	{
		key: "courses",
		label: "Courses"
	},
	{
		key: "liveClasses",
		label: "Live classes"
	},
	{
		key: "deals",
		label: "Deals and promo codes"
	},
	{
		key: "enrollmentRequests",
		label: "Enrollment requests"
	},
	{
		key: "tutorApplications",
		label: "Tutor applications"
	},
	{
		key: "settings",
		label: "Account settings"
	}
];
var adminPermissionsSchema = z.object(Object.fromEntries(ADMIN_FEATURES.map(({ key }) => [key, z.boolean()]))).strict();
function normalizeAdminPermissions(value) {
	const permissions = value && typeof value === "object" ? value : {};
	return Object.fromEntries(ADMIN_FEATURES.map(({ key }) => [key, permissions[key] === true]));
}
var ALL_ADMIN_PERMISSIONS = normalizeAdminPermissions(Object.fromEntries(ADMIN_FEATURES.map(({ key }) => [key, true])));
function isPrimaryAdmin(email) {
	const normalizedEmail = email.trim().toLowerCase();
	return PRIMARY_ADMIN_EMAILS.some((ownerEmail) => ownerEmail === normalizedEmail);
}
// server/routes/users.ts
var updateProfileSchema = z.object({
	full_name: z.string().trim().min(1).max(255).optional(),
	phone: z.string().trim().max(50).nullable().optional(),
	profile_image_url: z.union([z.literal(""), z.string().url().max(2048).refine((url) => /^https?:/.test(url))]).nullable().optional(),
	is_active: z.boolean().optional()
}).strict();
async function mayManageTarget(req, res) {
	const target = await query("SELECT id, email, role FROM users WHERE id=$1", [req.params.id]);
	if (!target.rows[0]) {
		sendError(res, "User not found", 404);
		return false;
	}
	const self = String(req.user?.userId) === String(req.params.id);
	if (target.rows[0].role === "admin" && !self && !isPrimaryAdmin(req.user?.email || "")) {
		sendError(res, "Only the primary admin can manage other admins", 403);
		return false;
	}
	return true;
}
var getUsers = async (req, res) => {
	try {
		const result = await query("SELECT id, email, full_name, role, profile_image_url, phone, is_active, created_at, updated_at FROM users ORDER BY created_at DESC");
		res.json({
			success: true,
			data: result.rows,
			message: "Users fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch users"
		});
	}
};
var getUserById = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("SELECT id, email, full_name, role, profile_image_url, phone, is_active, created_at, updated_at FROM users WHERE id = $1", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "User not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "User fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching user:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch user"
		});
	}
};
var createUser = async (req, res) => {
	try {
		const parsed = z.object({
			email: z.string().trim().toLowerCase().email().max(255),
			full_name: z.string().trim().min(1).max(255),
			role: z.enum([
				"admin",
				"teacher",
				"student"
			]),
			phone: z.string().trim().max(50).nullable().optional()
		}).safeParse(req.body);
		if (!parsed.success) return sendError(res, "Provide a valid email, full name, and role", 400);
		const { email: normalizedEmail, full_name, role, phone } = parsed.data;
		if (role === "admin" && !isPrimaryAdmin(req.user?.email || "")) return sendError(res, "Only the primary admin can create admins", 403);
		const result = await query("INSERT INTO users (email, password_hash, full_name, name, role, phone) VALUES ($1, $2, $3, $3, $4, $5) RETURNING id, email, full_name, role, phone, is_active, created_at, updated_at", [
			normalizedEmail,
			await hashPassword(crypto$1.randomBytes(32).toString("base64url")),
			full_name,
			role,
			phone || null
		]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "User created successfully"
		});
	} catch (error) {
		console.error("Error creating user:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Email already exists"
		});
		res.status(500).json({
			success: false,
			error: "Failed to create user"
		});
	}
};
var updateUser = async (req, res) => {
	try {
		const { id } = req.params;
		const parsed = updateProfileSchema.safeParse(req.body);
		if (!parsed.success) return sendError(res, "Provide valid profile fields; role, email, and credentials cannot be changed here", 400);
		if (String(req.user?.userId) === String(id) && parsed.data.is_active !== void 0) return sendError(res, "Account activation cannot be changed through self-profile editing", 403);
		if (!await mayManageTarget(req, res)) return;
		const { full_name, phone, profile_image_url, is_active } = parsed.data;
		const result = await query(`UPDATE users SET full_name=COALESCE($1,full_name), name=COALESCE($1,name),
       phone=CASE WHEN $2 THEN $3 ELSE phone END,
       profile_image_url=CASE WHEN $4 THEN $5 ELSE profile_image_url END,
       is_active=COALESCE($6,is_active),updated_at=CURRENT_TIMESTAMP
       WHERE id=$7 RETURNING id,email,full_name,role,profile_image_url,phone,is_active,created_at,updated_at`, [
			full_name || null,
			"phone" in parsed.data,
			phone || null,
			"profile_image_url" in parsed.data,
			profile_image_url || null,
			is_active ?? null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "User not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "User updated successfully"
		});
	} catch (error) {
		console.error("Error updating user:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Email already exists"
		});
		res.status(500).json({
			success: false,
			error: "Failed to update user"
		});
	}
};
var deleteUser = async (req, res) => {
	try {
		const { id } = req.params;
		if (!await mayManageTarget(req, res)) return;
		if (isPrimaryAdmin((await query("SELECT email FROM users WHERE id=$1", [id])).rows[0]?.email || "") || String(req.user?.userId) === String(id)) return sendError(res, "Primary admin accounts and your own account cannot be deleted here", 403);
		const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "User not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "User deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting user:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete user"
		});
	}
};
// server/utils/adminPermissionMiddleware.ts
async function getAdminUser(userId) {
	return (await query("SELECT email, role, admin_permissions FROM users WHERE id = $1", [userId])).rows[0];
}
async function hasAdminFeatureAccess(userId, feature) {
	const user = await getAdminUser(userId);
	return Boolean(user && user.role === "admin" && (isPrimaryAdmin(user.email) || normalizeAdminPermissions(user.admin_permissions)[feature]));
}
function requireAdminFeature(...features) {
	return async (req, res, next) => {
		if (!req.user?.userId) return sendError(res, "Authentication required", 401);
		try {
			const user = await getAdminUser(req.user.userId);
			if (!user || user.role !== "admin") return sendError(res, "Admin access required", 403);
			if (features.some((feature) => isPrimaryAdmin(user.email) || normalizeAdminPermissions(user.admin_permissions)[feature])) return next();
			return sendError(res, "You do not have permission to manage this area", 403);
		} catch (error) {
			console.error("Unable to verify admin permissions:", error);
			return sendError(res, "Unable to verify permissions", 500);
		}
	};
}
var requireAdminSelfOrUserManagement = async (req, res, next) => {
	if (req.user?.userId && String(req.user.userId) === String(req.params.id)) return next();
	return requireAdminFeature("users")(req, res, next);
};
var requirePrimaryAdmin = async (req, res, next) => {
	if (!req.user?.userId) return sendError(res, "Authentication required", 401);
	try {
		const user = await getAdminUser(req.user.userId);
		if (!user || user.role !== "admin" || !isPrimaryAdmin(user.email)) return sendError(res, "Only the primary admin can manage co-admin access", 403);
		return next();
	} catch (error) {
		console.error("Unable to verify primary admin:", error);
		return sendError(res, "Unable to verify permissions", 500);
	}
};
// server/routes/courses.ts
function meetingId() {
	return `ELX-${crypto$1.randomBytes(5).toString("hex").toUpperCase()}`;
}
var getCourses = async (req, res) => {
	try {
		const result = await query(`SELECT
        c.*,
        u.full_name AS instructor_name,
        (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrollment_count
      FROM courses c
      LEFT JOIN users u ON u.id = c.instructor_id
      ORDER BY c.created_at DESC`);
		res.set("Cache-Control", "private, max-age=30");
		res.json({
			success: true,
			data: result.rows,
			message: "Courses fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching courses:", error);
		res.status(500).json({
			success: false,
			error: error instanceof Error && error.message.includes("timed out") ? "Database query timed out. Please try again." : "Failed to fetch courses"
		});
	}
};
var getCourseById = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query(`SELECT
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
      `, [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Course not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Course fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching course:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch course"
		});
	}
};
var createCourse = async (req, res) => {
	try {
		const { title, description, instructor_id, category, duration_weeks, start_date, end_date, thumbnail_url } = req.body;
		if (!title) return res.status(400).json({
			success: false,
			error: "Missing required field: title"
		});
		if (start_date && end_date && new Date(start_date).getTime() > new Date(end_date).getTime()) return res.status(400).json({
			success: false,
			error: "Course end date must be after the start date"
		});
		const result = await query("INSERT INTO courses (title, description, instructor_id, category, duration_weeks, start_date, end_date, thumbnail_url, meeting_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *", [
			title,
			description || null,
			instructor_id || null,
			category || null,
			duration_weeks || null,
			start_date || null,
			end_date || null,
			thumbnail_url || null,
			meetingId()
		]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Course created successfully"
		});
	} catch (error) {
		console.error("Error creating course:", error);
		res.status(500).json({
			success: false,
			error: "Failed to create course"
		});
	}
};
var updateCourse = async (req, res) => {
	try {
		const { id } = req.params;
		const { title, description, category, duration_weeks, start_date, end_date, is_published, instructor_id } = req.body;
		const instructorProvided = Object.prototype.hasOwnProperty.call(req.body, "instructor_id");
		if (start_date && end_date && new Date(start_date).getTime() > new Date(end_date).getTime()) return res.status(400).json({
			success: false,
			error: "Course end date must be after the start date"
		});
		const result = await query("UPDATE courses SET title = COALESCE($1, title), description = COALESCE($2, description), category = COALESCE($3, category), duration_weeks = COALESCE($4, duration_weeks), start_date = COALESCE($5, start_date), end_date = COALESCE($6, end_date), is_published = COALESCE($7, is_published), instructor_id = CASE WHEN $8 THEN $9 ELSE instructor_id END, updated_at = CURRENT_TIMESTAMP WHERE id = $10 RETURNING *", [
			title || null,
			description || null,
			category || null,
			duration_weeks || null,
			start_date || null,
			end_date || null,
			is_published !== void 0 ? is_published : null,
			instructorProvided,
			instructor_id || null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Course not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Course updated successfully"
		});
	} catch (error) {
		console.error("Error updating course:", error);
		res.status(500).json({
			success: false,
			error: "Failed to update course"
		});
	}
};
var deleteCourse = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("DELETE FROM courses WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Course not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Course deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting course:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete course"
		});
	}
};
var enrollStudent = async (req, res) => {
	try {
		if (!req.user || req.user.role !== "admin" || !await hasAdminFeatureAccess(req.user.userId, "users")) return res.status(403).json({
			success: false,
			error: "Enrollment management access required"
		});
		const { student_id, course_id } = req.body;
		if (!student_id || !course_id) return res.status(400).json({
			success: false,
			error: "Missing required fields: student_id, course_id"
		});
		const result = await query("INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2) RETURNING *", [student_id, course_id]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Student enrolled successfully"
		});
	} catch (error) {
		console.error("Error enrolling student:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Student already enrolled in this course"
		});
		res.status(500).json({
			success: false,
			error: "Failed to enroll student"
		});
	}
};
var getEnrollments = async (req, res) => {
	try {
		const actor = req.user;
		if (!actor) return res.status(401).json({
			success: false,
			error: "Authentication required"
		});
		let { course_id, student_id } = req.query;
		if (actor.role === "student") {
			if (student_id && String(student_id) !== String(actor.userId)) return res.status(403).json({
				success: false,
				error: "You may only view your own enrollments"
			});
			student_id = String(actor.userId);
		} else if (actor.role !== "admin" || !await hasAdminFeatureAccess(actor.userId, "users")) return res.status(403).json({
			success: false,
			error: "Enrollment access required"
		});
		const isValidId = (v) => typeof v === "string" && /^\d+$/.test(v);
		if (student_id && !isValidId(student_id)) return res.status(400).json({
			success: false,
			error: "Invalid student id"
		});
		if (course_id && !isValidId(course_id)) return res.status(400).json({
			success: false,
			error: "Invalid course id"
		});
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
		const params = [];
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
			message: "Enrollments fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching enrollments:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch enrollments"
		});
	}
};
var deleteEnrollment = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("DELETE FROM enrollments WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Enrollment not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Enrollment removed successfully"
		});
	} catch (error) {
		console.error("Error removing enrollment:", error);
		res.status(500).json({
			success: false,
			error: "Failed to remove enrollment"
		});
	}
};
// server/routes/enrollmentRequests.ts
var bucket = "payment-receipts";
var signedUrlLifetimeSeconds = 120;
var maxReceiptBytes = 5242880;
var allowedReceiptTypes = /* @__PURE__ */ new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf"
]);
var SupabaseRequestError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.status = status;
	}
};
function supabaseConfig() {
	const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
	const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error("Supabase server configuration is missing. Set SUPABASE_URL and the server-only SUPABASE_SECRET_KEY.");
	return {
		url: url.replace(/\/+$/, ""),
		key
	};
}
async function supabaseRequest(path, init = {}) {
	const { url, key } = supabaseConfig();
	const response = await fetch(`${url}${path}`, {
		...init,
		headers: {
			apikey: key,
			Authorization: `Bearer ${key}`,
			...init.headers
		}
	});
	const text = await response.text();
	let body;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	if (!response.ok) throw new SupabaseRequestError(typeof body === "object" && body !== null && "message" in body ? String(body.message) : `Supabase returned HTTP ${response.status}`, response.status);
	return body;
}
/** Count the current Supabase queue, including queues larger than the REST row limit. */
async function getPendingEnrollmentRequestCount() {
	const { url, key } = supabaseConfig();
	const params = new URLSearchParams({
		select: "id",
		status: "eq.pending",
		submission_state: "eq.complete"
	});
	const response = await fetch(`${url}${tablePath(params.toString())}`, {
		method: "HEAD",
		headers: {
			apikey: key,
			Authorization: `Bearer ${key}`,
			Prefer: "count=exact",
			Range: "0-0"
		}
	});
	if (!response.ok) throw new SupabaseRequestError("Unable to count enrollment applications", response.status);
	const count = /\/(\d+)$/.exec(response.headers.get("content-range") || "");
	if (!count) throw new Error("Supabase did not return an exact enrollment count.");
	return Number(count[1]);
}
function tablePath(queryString) {
	return `/rest/v1/enrollment_applications?${queryString}`;
}
function storagePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}
async function uploadReceipt(path, contentType, data) {
	const { url, key } = supabaseConfig();
	const response = await fetch(`${url}/storage/v1/object/${bucket}/${storagePath(path)}`, {
		method: "POST",
		headers: {
			apikey: key,
			Authorization: `Bearer ${key}`,
			"Content-Type": contentType,
			"x-upsert": "false"
		},
		body: new Blob([Uint8Array.from(data)], { type: contentType })
	});
	if (!response.ok) throw new SupabaseRequestError(await response.text() || `Supabase Storage returned HTTP ${response.status}`, response.status);
}
async function removeReceipt(path) {
	try {
		await supabaseRequest(`/storage/v1/object/${bucket}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prefixes: [path] })
		});
	} catch (error) {
		if (error instanceof SupabaseRequestError && error.status === 404) return;
		throw error;
	}
}
function parseReceipt(dataUrl) {
	if (typeof dataUrl !== "string") throw new Error("A payment receipt is required.");
	const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
	if (!match || !allowedReceiptTypes.has(match[1])) throw new Error("Receipt must be a JPEG, PNG, WebP, or PDF file.");
	const data = Buffer.from(match[2], "base64");
	if (!data.length) throw new Error("Receipt file is empty.");
	if (data.length > maxReceiptBytes) throw new Error("Receipt must be smaller than 5 MB.");
	if (!(match[1] === "image/jpeg" && data[0] === 255 && data[1] === 216 && data[2] === 255 || match[1] === "image/png" && data.subarray(0, 8).equals(Buffer.from([
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	])) || match[1] === "image/webp" && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" || match[1] === "application/pdf" && data.toString("ascii", 0, 5) === "%PDF-")) throw new Error("Receipt file content does not match its file type.");
	const extension = match[1] === "image/jpeg" ? "jpg" : match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "pdf";
	return {
		contentType: match[1],
		data,
		extension
	};
}
async function updateApplication(id, values, filters = "") {
	const params = new URLSearchParams({
		id: `eq.${id}`,
		select: "*"
	});
	if (filters) for (const [key, value] of new URLSearchParams(filters)) params.set(key, value);
	return supabaseRequest(tablePath(params.toString()), {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
			Prefer: "return=representation"
		},
		body: JSON.stringify(values)
	});
}
async function processCleanup(id, expectedStatus, force = false) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const application = (await updateApplication(id, {
		cleanup_status: "cleaning",
		next_cleanup_at: new Date(Date.now() + 12e4).toISOString()
	}, force ? `cleanup_status=eq.${expectedStatus}` : `cleanup_status=eq.${expectedStatus}&next_cleanup_at=lte.${now}`))[0];
	if (!application) return {
		claimed: false,
		error: null
	};
	try {
		await removeReceipt(application.receipt_path);
		await updateApplication(id, {
			cleanup_status: "complete",
			cleanup_error: null,
			next_cleanup_at: null
		});
		return {
			claimed: true,
			error: null
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown receipt deletion error";
		const retryDelayMs = Math.min(36e5, 3e4 * 2 ** Math.min(application.cleanup_attempts, 7));
		await updateApplication(id, {
			cleanup_status: "failed",
			cleanup_attempts: application.cleanup_attempts + 1,
			cleanup_error: message.slice(0, 1e3),
			next_cleanup_at: new Date(Date.now() + retryDelayMs).toISOString()
		});
		console.error(`Receipt cleanup failed for enrollment ${id}:`, error);
		return {
			claimed: true,
			error: message
		};
	}
}
async function retryEnrollmentReceiptCleanup() {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const staleUploadCutoff = (/* @__PURE__ */ new Date(Date.now() - 3e5)).toISOString();
	const staleUploads = await supabaseRequest(tablePath(new URLSearchParams({
		select: "id",
		submission_state: "eq.uploading",
		requested_at: `lte.${staleUploadCutoff}`,
		limit: "25"
	}).toString()));
	for (const application of staleUploads) await updateApplication(application.id, {
		submission_state: "failed",
		cleanup_status: "queued",
		cleanup_error: "Receipt upload did not complete; cleanup retry queued.",
		next_cleanup_at: now
	}, `submission_state=eq.uploading&requested_at=lte.${staleUploadCutoff}`);
	const eligible = await supabaseRequest(tablePath(new URLSearchParams({
		select: "id,cleanup_status",
		cleanup_status: "in.(queued,failed,cleaning)",
		next_cleanup_at: `lte.${now}`,
		limit: "25"
	}).toString()));
	for (const application of eligible) {
		const result = await processCleanup(application.id, application.cleanup_status);
		if (result.error) console.error(`Enrollment receipt cleanup remains pending for ${application.id}: ${result.error}`);
	}
}
var getEnrollmentRequests = async (req, res) => {
	try {
		await retryEnrollmentReceiptCleanup();
		const params = new URLSearchParams({
			select: "*",
			order: "requested_at.desc"
		});
		if (req.query.status) params.set("status", `eq.${String(req.query.status)}`);
		if (req.query.student_id) params.set("student_id", `eq.${String(req.query.student_id)}`);
		const data = await supabaseRequest(tablePath(params.toString()));
		res.json({
			success: true,
			data: data.map(({ receipt_path: _receiptPath, ...application }) => application)
		});
	} catch (error) {
		console.error("Error fetching enrollment applications:", error);
		res.status(500).json({
			success: false,
			error: error instanceof Error && error.message.includes("Supabase server configuration") ? error.message : "Failed to fetch enrollment applications"
		});
	}
};
var createEnrollmentRequest = async (req, res) => {
	try {
		const courseId = String(req.body.course_id || "").trim();
		const studentPhone = String(req.body.student_phone || "").trim();
		const transferReference = String(req.body.transfer_reference || "").trim();
		const senderAccountTitle = String(req.body.sender_account_title || "").trim();
		const senderAccountNumber = String(req.body.sender_account_number || "").trim();
		if (!req.user?.userId || !courseId || !studentPhone || !senderAccountTitle || !senderAccountNumber) return res.status(400).json({
			success: false,
			error: "Course, phone number, sender account title, account number, and receipt are required."
		});
		if (studentPhone.length > 64 || senderAccountTitle.length > 255 || senderAccountNumber.length > 255 || transferReference.length > 255) return res.status(400).json({
			success: false,
			error: "One or more enrollment details are too long."
		});
		let receipt;
		try {
			receipt = parseReceipt(req.body.receipt_data_url);
		} catch (error) {
			return res.status(400).json({
				success: false,
				error: error instanceof Error ? error.message : "Invalid receipt file."
			});
		}
		const [user, course] = await Promise.all([query("SELECT id, full_name, email, role FROM users WHERE id = $1", [req.user.userId]), query("SELECT id, title FROM courses WHERE id = $1", [courseId])]);
		if (!user.rows[0] || user.rows[0].role !== "student") return res.status(403).json({
			success: false,
			error: "A student account is required."
		});
		if (!course.rows[0]) return res.status(404).json({
			success: false,
			error: "Course not found."
		});
		if ((await query("SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2", [user.rows[0].id, courseId])).rows.length) return res.status(409).json({
			success: false,
			error: "You are already enrolled in this course."
		});
		if ((await supabaseRequest(tablePath(new URLSearchParams({
			select: "id",
			student_id: `eq.${user.rows[0].id}`,
			course_id: `eq.${courseId}`,
			status: "eq.pending",
			submission_state: "eq.complete",
			limit: "1"
		}).toString()))).length) return res.status(409).json({
			success: false,
			error: "A pending application already exists for this course."
		});
		const applicationIdValue = crypto.randomUUID();
		const extension = receipt.extension;
		const receiptPath = `${user.rows[0].id}/${applicationIdValue}.${extension}`;
		if (!(await supabaseRequest(tablePath("select=*"), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Prefer: "return=representation"
			},
			body: JSON.stringify({
				id: applicationIdValue,
				student_id: String(user.rows[0].id),
				student_name: user.rows[0].full_name,
				student_email: user.rows[0].email,
				student_phone: studentPhone,
				course_id: String(course.rows[0].id),
				course_title: course.rows[0].title,
				transfer_reference: transferReference || null,
				sender_account_title: senderAccountTitle,
				sender_account_number: senderAccountNumber,
				receipt_path: receiptPath,
				status: "pending",
				submission_state: "uploading",
				cleanup_status: "none",
				cleanup_attempts: 0
			})
		}))[0]) throw new Error("Supabase did not return the created enrollment application.");
		try {
			await uploadReceipt(receiptPath, receipt.contentType, receipt.data);
			if (!(await updateApplication(applicationIdValue, { submission_state: "complete" }, "submission_state=eq.uploading"))[0]) throw new Error("Receipt was uploaded but the application could not be finalized.");
		} catch (error) {
			await updateApplication(applicationIdValue, {
				submission_state: "failed",
				cleanup_status: "queued",
				cleanup_error: (error instanceof Error ? error.message : "Unknown receipt upload error").slice(0, 1e3),
				next_cleanup_at: (/* @__PURE__ */ new Date()).toISOString()
			});
			console.error(`Receipt upload failed for enrollment ${applicationIdValue}:`, error);
			return res.status(502).json({
				success: false,
				error: "Receipt upload failed. The incomplete application is queued for automatic cleanup; please retry later."
			});
		}
		res.status(201).json({
			success: true,
			data: {
				id: applicationIdValue,
				status: "pending"
			},
			message: "Enrollment application submitted for review."
		});
	} catch (error) {
		console.error("Error creating enrollment application:", error);
		res.status(500).json({
			success: false,
			error: error instanceof Error && error.message.includes("Supabase server configuration") ? error.message : "Failed to create enrollment application"
		});
	}
};
var getEnrollmentReceiptUrl = async (req, res) => {
	try {
		const [application] = await supabaseRequest(tablePath(new URLSearchParams({
			select: "id,receipt_path,submission_state,cleanup_status",
			id: `eq.${String(req.params.id)}`,
			limit: "1"
		}).toString()));
		if (!application) return res.status(404).json({
			success: false,
			error: "Enrollment application not found."
		});
		if (application.submission_state !== "complete" || application.cleanup_status === "complete") return res.status(410).json({
			success: false,
			error: "This payment receipt is no longer available."
		});
		const signed = await supabaseRequest(`/storage/v1/object/sign/${bucket}/${storagePath(application.receipt_path)}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ expiresIn: signedUrlLifetimeSeconds })
		});
		if (!signed.signedURL) throw new Error("Supabase did not return a signed receipt URL.");
		const { url } = supabaseConfig();
		res.json({
			success: true,
			data: {
				url: signed.signedURL.startsWith("http") ? signed.signedURL : `${url}/storage/v1${signed.signedURL}`,
				expires_in: signedUrlLifetimeSeconds
			}
		});
	} catch (error) {
		console.error("Unable to sign enrollment receipt URL:", error);
		res.status(500).json({
			success: false,
			error: "Unable to open payment receipt."
		});
	}
};
var reviewEnrollmentRequest = async (req, res) => {
	let client;
	let transactionOpen = false;
	let enrollmentGranted = false;
	let decisionFinalized = false;
	try {
		const id = String(req.params.id);
		const requestedStatus = String(req.body.status || "");
		if (!["approved", "rejected"].includes(requestedStatus)) return res.status(400).json({
			success: false,
			error: "Status must be approved or rejected."
		});
		client = await connection_default.connect();
		await client.query("BEGIN");
		transactionOpen = true;
		await client.query("SELECT pg_advisory_xact_lock(1919246693, hashtext($1))", [id]);
		const params = new URLSearchParams({
			select: "*",
			id: `eq.${id}`,
			limit: "1"
		});
		const [application] = await supabaseRequest(tablePath(params.toString()));
		if (!application || application.submission_state !== "complete" || application.status !== "pending") {
			if (application?.submission_state === "complete" && application.status === requestedStatus) return res.json({
				success: true,
				data: {
					id,
					status: application.status,
					cleanup_status: application.cleanup_status
				},
				message: "This enrollment application has already been reviewed."
			});
			return res.status(409).json({
				success: false,
				error: "This application has already been reviewed or is not ready for review."
			});
		}
		let status = requestedStatus;
		if (requestedStatus === "approved") await client.query("INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2) ON CONFLICT (student_id, course_id) DO NOTHING", [application.student_id, application.course_id]);
		else if ((await client.query("SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2", [application.student_id, application.course_id])).rows.length) status = "approved";
		if (status === "approved") {
			await client.query("COMMIT");
			transactionOpen = false;
			enrollmentGranted = true;
		}
		let finalApplication = (await updateApplication(id, {
			status,
			reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
			reviewed_by: String(req.user?.userId),
			cleanup_status: "queued",
			next_cleanup_at: (/* @__PURE__ */ new Date()).toISOString()
		}, "status=eq.pending&submission_state=eq.complete"))[0];
		if (!finalApplication) {
			[finalApplication] = await supabaseRequest(tablePath(params.toString()));
			if (!finalApplication || finalApplication.status !== status) throw new Error("The enrollment decision could not be finalized.");
		}
		decisionFinalized = true;
		if (transactionOpen) {
			await client.query("COMMIT");
			transactionOpen = false;
		}
		const cleanup = finalApplication.cleanup_status === "complete" ? {
			claimed: true,
			error: null
		} : await processCleanup(id, "queued");
		if (cleanup.error) return res.status(503).json({
			success: false,
			data: {
				id,
				status,
				cleanup_status: "failed"
			},
			error: "The decision was saved, but receipt deletion failed. Cleanup is scheduled to retry automatically."
		});
		const cleanupStatus = cleanup.claimed ? "complete" : "queued";
		return res.json({
			success: true,
			data: {
				id,
				status,
				cleanup_status: cleanupStatus
			},
			message: status !== requestedStatus ? "Course access was already granted; the application was reconciled as approved." : cleanup.claimed ? `Enrollment application ${status}; receipt deleted.` : `Enrollment application ${status}; receipt cleanup is being processed.`
		});
	} catch (error) {
		console.error("Error reviewing enrollment application:", error);
		return res.status(500).json({
			success: false,
			error: decisionFinalized ? "The decision was saved, but receipt cleanup could not be confirmed. Refresh the applications and retry cleanup if needed." : enrollmentGranted ? "Course access was granted, but the application could not be finalized. Retry the review operation; the payment receipt has been retained." : "The review could not be completed. Please retry the review operation."
		});
	} finally {
		if (client) {
			let rollbackError;
			if (transactionOpen) try {
				await client.query("ROLLBACK");
			} catch (error) {
				rollbackError = error instanceof Error ? error : /* @__PURE__ */ new Error("Unable to roll back enrollment review");
				console.error("Unable to roll back enrollment review:", error);
			}
			client.release(rollbackError);
		}
	}
};
var retryEnrollmentRequestCleanup = async (req, res) => {
	try {
		const [application] = await supabaseRequest(tablePath(new URLSearchParams({
			select: "id,cleanup_status",
			id: `eq.${String(req.params.id)}`,
			cleanup_status: "in.(queued,failed)"
		}).toString()));
		if (!application) return res.status(409).json({
			success: false,
			error: "This application has no retryable receipt cleanup."
		});
		const result = await processCleanup(application.id, application.cleanup_status, true);
		if (result.error) return res.status(503).json({
			success: false,
			error: "Receipt deletion failed again; automatic retry remains scheduled."
		});
		return res.json({
			success: true,
			message: result.claimed ? "Receipt cleanup completed." : "Receipt cleanup is already being processed or is not retryable."
		});
	} catch (error) {
		console.error("Unable to retry enrollment receipt cleanup:", error);
		return res.status(500).json({
			success: false,
			error: "Unable to retry receipt cleanup."
		});
	}
};
// server/routes/stats.ts
var cachedStats = null;
var cachedAt = 0;
var CACHE_TTL_MS = 6e4;
var getPlatformStats = async (_req, res) => {
	if (cachedStats && Date.now() - cachedAt < CACHE_TTL_MS) return res.json({
		success: true,
		data: cachedStats,
		message: "Stats fetched successfully"
	});
	try {
		const hasEnrollmentStorage = Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
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
			revenue: 0
		};
		cachedAt = Date.now();
		res.json({
			success: true,
			data: cachedStats,
			message: "Stats fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching platform stats:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch platform stats"
		});
	}
};
// server/routes/tutorApplications.ts
var applicationSchema = z.object({
	full_name: z.string().min(2),
	email: z.string().email(),
	phone: z.string().min(5).optional().or(z.literal("")),
	expertise: z.string().min(2),
	experience_years: z.coerce.number().min(0).max(60),
	certificate_1: z.string().max(7e6).optional().or(z.literal("")),
	certificate_2: z.string().max(7e6).optional().or(z.literal("")),
	certificate_3: z.string().max(7e6).optional().or(z.literal("")),
	bio: z.string().min(20),
	password: z.string().min(8)
});
var applicationSelect = `
  SELECT
    id,
    full_name,
    email,
    phone,
    expertise,
    experience_years,
    certificate_1,
    certificate_2,
    certificate_3,
    bio,
    status,
    requested_at,
    reviewed_at,
    reviewed_by
  FROM tutor_applications
`;
var getTutorApplications = async (req, res) => {
	try {
		const { status } = req.query;
		const params = [];
		let sql = applicationSelect;
		if (status) {
			params.push(String(status));
			sql += " WHERE status = $1";
		}
		sql += " ORDER BY requested_at DESC";
		return sendSuccess(res, (await query(sql, params)).rows, "Tutor applications fetched successfully");
	} catch (error) {
		console.error("Error fetching tutor applications:", error);
		return sendError(res, "Failed to fetch tutor applications", 500);
	}
};
var createTutorApplication = async (req, res) => {
	const parsed = applicationSchema.safeParse(req.body);
	if (!parsed.success) return sendError(res, parsed.error.flatten().formErrors.join("; "), 400);
	const { full_name, email, phone, expertise, experience_years, certificate_1, certificate_2, certificate_3, bio, password } = parsed.data;
	const normalizedEmail = email.trim().toLowerCase();
	try {
		if ((await query("SELECT id FROM tutor_applications WHERE lower(email) = $1 AND status = 'pending'", [normalizedEmail])).rows.length > 0) return sendError(res, "A pending tutor application already exists for this email", 409);
		return sendSuccess(res, (await query(`INSERT INTO tutor_applications (
        full_name,
        email,
        phone,
        expertise,
        experience_years,
        certificate_1,
        certificate_2,
        certificate_3,
        bio,
        password_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, full_name, email, phone, expertise, experience_years, certificate_1, certificate_2, certificate_3, bio, status, requested_at, reviewed_at, reviewed_by`, [
			full_name.trim(),
			normalizedEmail,
			phone?.trim() || null,
			expertise.trim(),
			experience_years,
			certificate_1 || null,
			certificate_2 || null,
			certificate_3 || null,
			bio.trim(),
			await hashPassword(password)
		])).rows[0], "Tutor application submitted for review", 201);
	} catch (error) {
		console.error("Error creating tutor application:", error);
		return sendError(res, "Failed to submit tutor application", 500);
	}
};
var reviewTutorApplication = async (req, res) => {
	try {
		const applicationId = Number(req.params.id);
		const status = String(req.body.status || "");
		const reviewedBy = req.user?.userId ?? null;
		if (!applicationId || !["approved", "rejected"].includes(status)) return sendError(res, "Valid application id and status are required", 400);
		const existing = await query("SELECT * FROM tutor_applications WHERE id = $1", [applicationId]);
		if (existing.rows.length === 0) return sendError(res, "Tutor application not found", 404);
		const application = existing.rows[0];
		if (application.status !== "pending") return sendError(res, "This tutor application has already been reviewed", 409);
		if (status === "approved") {
			const existingUser = await query("SELECT id, role FROM users WHERE lower(email) = $1", [application.email]);
			if (existingUser.rows.length > 0 && existingUser.rows[0].role !== "teacher") return sendError(res, "This email already belongs to a non-teacher account", 409);
			if (existingUser.rows.length === 0) await query("INSERT INTO users (email, password_hash, full_name, role, phone) VALUES ($1, $2, $3, 'teacher', $4)", [
				application.email,
				application.password_hash,
				application.full_name,
				application.phone
			]);
		}
		return sendSuccess(res, (await query("UPDATE tutor_applications SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2 WHERE id = $3 RETURNING id, full_name, email, phone, expertise, experience_years, certificate_1, certificate_2, certificate_3, bio, status, requested_at, reviewed_at, reviewed_by", [
			status,
			reviewedBy,
			applicationId
		])).rows[0], `Tutor application ${status}`);
	} catch (error) {
		console.error("Error reviewing tutor application:", error);
		return sendError(res, "Failed to review tutor application", 500);
	}
};
// server/routes/categories.ts
var getCategories = async (req, res) => {
	try {
		const result = await query(`SELECT c.*, COUNT(cc.course_id)::int AS course_count 
       FROM categories c 
       LEFT JOIN course_categories cc ON cc.category_id = c.id 
       GROUP BY c.id 
       ORDER BY c.name ASC`);
		res.json({
			success: true,
			data: result.rows,
			message: "Categories fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching categories:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch categories"
		});
	}
};
var getCategoryBySlug = async (req, res) => {
	try {
		const { slug } = req.params;
		const result = await query(`SELECT c.*, COUNT(cc.course_id)::int AS course_count 
       FROM categories c 
       LEFT JOIN course_categories cc ON cc.category_id = c.id 
       WHERE c.slug = $1 
       GROUP BY c.id`, [slug]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Category not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Category fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching category:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch category"
		});
	}
};
var createCategory = async (req, res) => {
	try {
		const { name, description, slug } = req.body;
		if (!name || !slug) return res.status(400).json({
			success: false,
			error: "Missing required fields: name, slug"
		});
		const result = await query("INSERT INTO categories (name, description, slug) VALUES ($1, $2, $3) RETURNING *", [
			name,
			description || null,
			slug
		]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Category created successfully"
		});
	} catch (error) {
		console.error("Error creating category:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Category with this name or slug already exists"
		});
		res.status(500).json({
			success: false,
			error: "Failed to create category"
		});
	}
};
var updateCategory = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, description, slug } = req.body;
		const result = await query("UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description), slug = COALESCE($3, slug) WHERE id = $4 RETURNING *", [
			name || null,
			description || null,
			slug || null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Category not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Category updated successfully"
		});
	} catch (error) {
		console.error("Error updating category:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Category with this name or slug already exists"
		});
		res.status(500).json({
			success: false,
			error: "Failed to update category"
		});
	}
};
var deleteCategory = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("DELETE FROM categories WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Category not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Category deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting category:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete category"
		});
	}
};
var assignCategoryToCourse = async (req, res) => {
	try {
		const { course_id, category_id } = req.body;
		if (!course_id || !category_id) return res.status(400).json({
			success: false,
			error: "Missing required fields: course_id, category_id"
		});
		const result = await query("INSERT INTO course_categories (course_id, category_id) VALUES ($1, $2) RETURNING *", [course_id, category_id]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Category assigned to course successfully"
		});
	} catch (error) {
		console.error("Error assigning category:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Category already assigned to this course"
		});
		res.status(500).json({
			success: false,
			error: "Failed to assign category"
		});
	}
};
var removeCategoryFromCourse = async (req, res) => {
	try {
		const { course_id, category_id } = req.params;
		const result = await query("DELETE FROM course_categories WHERE course_id = $1 AND category_id = $2 RETURNING *", [course_id, category_id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Category assignment not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Category removed from course successfully"
		});
	} catch (error) {
		console.error("Error removing category:", error);
		res.status(500).json({
			success: false,
			error: "Failed to remove category"
		});
	}
};
var getCategoriesForCourse = async (req, res) => {
	try {
		const { course_id } = req.params;
		const result = await query(`SELECT cat.* 
       FROM categories cat
       INNER JOIN course_categories cc ON cc.category_id = cat.id
       WHERE cc.course_id = $1
       ORDER BY cat.name ASC`, [course_id]);
		res.json({
			success: true,
			data: result.rows,
			message: "Course categories fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching course categories:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch course categories"
		});
	}
};
// server/routes/tags.ts
var getTags = async (req, res) => {
	try {
		const result = await query(`SELECT t.*, COUNT(ct.course_id)::int AS course_count 
       FROM tags t 
       LEFT JOIN course_tags ct ON ct.tag_id = t.id 
       GROUP BY t.id 
       ORDER BY t.name ASC`);
		res.json({
			success: true,
			data: result.rows,
			message: "Tags fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching tags:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch tags"
		});
	}
};
var getTagBySlug = async (req, res) => {
	try {
		const { slug } = req.params;
		const result = await query(`SELECT t.*, COUNT(ct.course_id)::int AS course_count 
       FROM tags t 
       LEFT JOIN course_tags ct ON ct.tag_id = t.id 
       WHERE t.slug = $1 
       GROUP BY t.id`, [slug]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Tag not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Tag fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching tag:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch tag"
		});
	}
};
var createTag = async (req, res) => {
	try {
		const { name, slug } = req.body;
		if (!name || !slug) return res.status(400).json({
			success: false,
			error: "Missing required fields: name, slug"
		});
		const result = await query("INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING *", [name, slug]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Tag created successfully"
		});
	} catch (error) {
		console.error("Error creating tag:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Tag with this name or slug already exists"
		});
		res.status(500).json({
			success: false,
			error: "Failed to create tag"
		});
	}
};
var updateTag = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, slug } = req.body;
		const result = await query("UPDATE tags SET name = COALESCE($1, name), slug = COALESCE($2, slug) WHERE id = $3 RETURNING *", [
			name || null,
			slug || null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Tag not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Tag updated successfully"
		});
	} catch (error) {
		console.error("Error updating tag:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Tag with this name or slug already exists"
		});
		res.status(500).json({
			success: false,
			error: "Failed to update tag"
		});
	}
};
var deleteTag = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("DELETE FROM tags WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Tag not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Tag deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting tag:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete tag"
		});
	}
};
var assignTagToCourse = async (req, res) => {
	try {
		const { course_id, tag_id } = req.body;
		if (!course_id || !tag_id) return res.status(400).json({
			success: false,
			error: "Missing required fields: course_id, tag_id"
		});
		const result = await query("INSERT INTO course_tags (course_id, tag_id) VALUES ($1, $2) RETURNING *", [course_id, tag_id]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Tag assigned to course successfully"
		});
	} catch (error) {
		console.error("Error assigning tag:", error);
		if (error.code === "23505") return res.status(409).json({
			success: false,
			error: "Tag already assigned to this course"
		});
		res.status(500).json({
			success: false,
			error: "Failed to assign tag"
		});
	}
};
var removeTagFromCourse = async (req, res) => {
	try {
		const { course_id, tag_id } = req.params;
		const result = await query("DELETE FROM course_tags WHERE course_id = $1 AND tag_id = $2 RETURNING *", [course_id, tag_id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Tag assignment not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Tag removed from course successfully"
		});
	} catch (error) {
		console.error("Error removing tag:", error);
		res.status(500).json({
			success: false,
			error: "Failed to remove tag"
		});
	}
};
var getTagsForCourse = async (req, res) => {
	try {
		const { course_id } = req.params;
		const result = await query(`SELECT t.* 
       FROM tags t
       INNER JOIN course_tags ct ON ct.tag_id = t.id
       WHERE ct.course_id = $1
       ORDER BY t.name ASC`, [course_id]);
		res.json({
			success: true,
			data: result.rows,
			message: "Course tags fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching course tags:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch course tags"
		});
	}
};
// server/utils/studentDataAccess.ts
async function canAccessStudentData(actor, studentId, courseId, adminFeature = "courses") {
	if (actor.role === "student" && String(actor.userId) === String(studentId)) {
		if (!courseId) return true;
		return (await query("SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2", [studentId, courseId])).rows.length > 0;
	}
	if (actor.role === "teacher" && courseId) return (await query(`SELECT c.id
       FROM courses c
       JOIN enrollments e ON e.course_id = c.id
       WHERE c.id = $1 AND c.instructor_id = $2 AND e.student_id = $3`, [
		courseId,
		actor.userId,
		studentId
	])).rows.length > 0;
	return actor.role === "admin" && await hasAdminFeatureAccess(actor.userId, adminFeature);
}
async function canAccessCourse(actor, courseId, adminFeature = "courses") {
	if (actor.role === "student") return (await query("SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2", [actor.userId, courseId])).rows.length > 0 ? "enrolled" : "preview";
	if (actor.role === "teacher") return (await query("SELECT id FROM courses WHERE id = $1 AND instructor_id = $2", [courseId, actor.userId])).rows.length > 0 ? "full" : false;
	if (actor.role === "admin" && await hasAdminFeatureAccess(actor.userId, adminFeature)) return "full";
	return false;
}
// server/routes/progress.ts
var getStudentProgress = async (req, res) => {
	try {
		const { student_id } = req.params;
		const { course_id } = req.query;
		if (typeof student_id !== "string") return res.status(400).json({
			success: false,
			error: "Invalid student id"
		});
		const actor = req.user;
		if (!actor || !await canAccessStudentData(actor, student_id, typeof course_id === "string" ? course_id : void 0)) return res.status(403).json({
			success: false,
			error: "Student progress access required"
		});
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
		const params = [student_id];
		if (course_id) {
			queryStr += ` AND cm.course_id = $${params.length + 1}`;
			params.push(course_id);
		}
		queryStr += " ORDER BY cm.order_index ASC, cl.order_index ASC";
		const result = await query(queryStr, params);
		res.json({
			success: true,
			data: result.rows,
			message: "Student progress fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching student progress:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch student progress"
		});
	}
};
var updateLessonProgress = async (req, res) => {
	try {
		const { student_id, lesson_id } = req.params;
		if (typeof student_id !== "string" || typeof lesson_id !== "string") return res.status(400).json({
			success: false,
			error: "Invalid progress target"
		});
		const { is_completed, progress_percentage, last_watched_at } = req.body;
		if (is_completed !== void 0 && typeof is_completed !== "boolean" || progress_percentage !== void 0 && (typeof progress_percentage !== "number" || !Number.isFinite(progress_percentage) || progress_percentage < 0 || progress_percentage > 100) || last_watched_at !== void 0 && (typeof last_watched_at !== "string" || !Number.isFinite(Date.parse(last_watched_at)) || Date.parse(last_watched_at) > Date.now())) return res.status(400).json({
			success: false,
			error: "Invalid lesson progress values"
		});
		const lesson = await query(`SELECT cm.course_id
       FROM course_lessons cl
       JOIN course_modules cm ON cm.id = cl.module_id
       WHERE cl.id = $1`, [lesson_id]);
		if (!lesson.rows[0]) return res.status(404).json({
			success: false,
			error: "Lesson not found"
		});
		if (!req.user || !await canAccessStudentData(req.user, student_id, lesson.rows[0].course_id)) return res.status(403).json({
			success: false,
			error: "Student progress access required"
		});
		const result = await query(`INSERT INTO lesson_progress (
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
       RETURNING *`, [
			student_id,
			lesson_id,
			is_completed ?? null,
			progress_percentage ?? null,
			last_watched_at ?? null
		]);
		res.json({
			success: true,
			data: result.rows[0],
			message: "Lesson progress updated successfully"
		});
	} catch (error) {
		console.error("Error updating lesson progress:", error);
		res.status(500).json({
			success: false,
			error: "Failed to update lesson progress"
		});
	}
};
var getCourseProgress = async (req, res) => {
	try {
		const { student_id, course_id } = req.params;
		if (typeof student_id !== "string" || typeof course_id !== "string") return res.status(400).json({
			success: false,
			error: "Invalid progress target"
		});
		if (!req.user || !await canAccessStudentData(req.user, student_id, course_id)) return res.status(403).json({
			success: false,
			error: "Student progress access required"
		});
		const result = await query(`
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
      `, [student_id, course_id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Course not found or student not enrolled"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Course progress fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching course progress:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch course progress"
		});
	}
};
var completeCourse = async (req, res) => {
	try {
		const { student_id, course_id } = req.params;
		if (typeof student_id !== "string" || typeof course_id !== "string") return res.status(400).json({
			success: false,
			error: "Invalid progress target"
		});
		if (!req.user || !await canAccessStudentData(req.user, student_id, course_id)) return res.status(403).json({
			success: false,
			error: "Student progress access required"
		});
		const result = await query(`UPDATE enrollments 
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
       RETURNING *`, [student_id, course_id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Enrollment not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Course marked as completed"
		});
	} catch (error) {
		console.error("Error completing course:", error);
		res.status(500).json({
			success: false,
			error: "Failed to complete course"
		});
	}
};
var getCourseStructure = async (req, res) => {
	try {
		const { course_id } = req.params;
		if (typeof course_id !== "string") return res.status(400).json({
			success: false,
			error: "Invalid course id"
		});
		const actor = req.user;
		if (!actor) return res.status(401).json({
			success: false,
			error: "Authentication required"
		});
		const access = await canAccessCourse(actor, course_id);
		if (!access) return res.status(403).json({
			success: false,
			error: "Course access required"
		});
		if (!(await query("SELECT id FROM courses WHERE id = $1", [course_id])).rows[0]) return res.status(404).json({
			success: false,
			error: "Course not found"
		});
		const modulesResult = await query(`SELECT * FROM course_modules WHERE course_id = $1 ORDER BY order_index ASC`, [course_id]);
		const moduleIds = modulesResult.rows.map((module) => module.id);
		const lessonsResult = moduleIds.length ? await query(`SELECT * FROM course_lessons
           WHERE module_id = ANY($1)
           ${access === "preview" ? "AND is_preview = true" : ""}
           ORDER BY order_index ASC`, [moduleIds]) : { rows: [] };
		const progressStudentId = access === "preview" ? void 0 : actor.role === "student" ? actor.userId : typeof req.query.student_id === "string" ? req.query.student_id : void 0;
		let progressMap = /* @__PURE__ */ new Map();
		if (progressStudentId !== void 0) {
			if (!await canAccessStudentData(actor, progressStudentId, course_id)) return res.status(403).json({
				success: false,
				error: "Student progress access required"
			});
			const progressResult = await query(`SELECT lp.lesson_id, lp.is_completed, lp.progress_percentage
         FROM lesson_progress lp
         JOIN course_lessons cl ON cl.id = lp.lesson_id
         JOIN course_modules cm ON cm.id = cl.module_id
         WHERE lp.student_id = $1 AND cm.course_id = $2`, [progressStudentId, course_id]);
			progressMap = new Map(progressResult.rows.map((progress) => [progress.lesson_id, progress]));
		}
		const lessonsByModule = /* @__PURE__ */ new Map();
		for (const lesson of lessonsResult.rows) {
			const lessons = lessonsByModule.get(lesson.module_id) ?? [];
			lessons.push({
				...lesson,
				...progressMap.has(lesson.id) ? { progress: progressMap.get(lesson.id) } : {}
			});
			lessonsByModule.set(lesson.module_id, lessons);
		}
		const modules = modulesResult.rows.map((module) => ({
			...module,
			lessons: lessonsByModule.get(module.id) ?? []
		}));
		res.json({
			success: true,
			data: modules,
			message: "Course structure fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching course structure:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch course structure"
		});
	}
};
var createModule = async (req, res) => {
	try {
		const { course_id, title, description, order_index } = req.body;
		if (!course_id || !title || order_index === void 0) return res.status(400).json({
			success: false,
			error: "Missing required fields: course_id, title, order_index"
		});
		const result = await query("INSERT INTO course_modules (course_id, title, description, order_index) VALUES ($1, $2, $3, $4) RETURNING *", [
			course_id,
			title,
			description || null,
			order_index
		]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Module created successfully"
		});
	} catch (error) {
		console.error("Error creating module:", error);
		res.status(500).json({
			success: false,
			error: "Failed to create module"
		});
	}
};
var updateModule = async (req, res) => {
	try {
		const { id } = req.params;
		const { title, description, order_index } = req.body;
		const result = await query("UPDATE course_modules SET title = COALESCE($1, title), description = COALESCE($2, description), order_index = COALESCE($3, order_index), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *", [
			title || null,
			description || null,
			order_index !== void 0 ? order_index : null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Module not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Module updated successfully"
		});
	} catch (error) {
		console.error("Error updating module:", error);
		res.status(500).json({
			success: false,
			error: "Failed to update module"
		});
	}
};
var deleteModule = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("DELETE FROM course_modules WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Module not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Module deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting module:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete module"
		});
	}
};
var createLesson = async (req, res) => {
	try {
		const { module_id, title, content_type, content_text, video_url, duration_minutes, order_index, is_preview } = req.body;
		if (!module_id || !title || !content_type || order_index === void 0) return res.status(400).json({
			success: false,
			error: "Missing required fields: module_id, title, content_type, order_index"
		});
		const result = await query("INSERT INTO course_lessons (module_id, title, content_type, content_text, video_url, duration_minutes, order_index, is_preview) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *", [
			module_id,
			title,
			content_type,
			content_text || null,
			video_url || null,
			duration_minutes || null,
			order_index,
			is_preview || false
		]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Lesson created successfully"
		});
	} catch (error) {
		console.error("Error creating lesson:", error);
		res.status(500).json({
			success: false,
			error: "Failed to create lesson"
		});
	}
};
var updateLesson = async (req, res) => {
	try {
		const { id } = req.params;
		const { title, content_type, content_text, video_url, duration_minutes, order_index, is_preview } = req.body;
		const result = await query("UPDATE course_lessons SET title = COALESCE($1, title), content_type = COALESCE($2, content_type), content_text = COALESCE($3, content_text), video_url = COALESCE($4, video_url), duration_minutes = COALESCE($5, duration_minutes), order_index = COALESCE($6, order_index), is_preview = COALESCE($7, is_preview), updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *", [
			title || null,
			content_type || null,
			content_text || null,
			video_url || null,
			duration_minutes || null,
			order_index !== void 0 ? order_index : null,
			is_preview !== void 0 ? is_preview : null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Lesson not found"
		});
		res.json({
			success: true,
			data: result.rows[0],
			message: "Lesson updated successfully"
		});
	} catch (error) {
		console.error("Error updating lesson:", error);
		res.status(500).json({
			success: false,
			error: "Failed to update lesson"
		});
	}
};
var deleteLesson = async (req, res) => {
	try {
		const { id } = req.params;
		const result = await query("DELETE FROM course_lessons WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Lesson not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Lesson deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting lesson:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete lesson"
		});
	}
};
// server/routes/liveClasses.ts
var joinWindowMinutes = 5;
var liveClassSelect = `
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
	return `live_${crypto$1.randomBytes(12).toString("hex")}`;
}
function joinState(row) {
	const now = Date.now();
	const start = new Date(row.scheduled_start).getTime();
	const end = new Date(row.scheduled_end).getTime();
	const opensAt = start - 3e5;
	return {
		join_opens_at: new Date(opensAt).toISOString(),
		can_join: row.status === "active" && now >= opensAt && now <= end,
		has_ended: now > end || row.status === "completed" || row.status === "cancelled"
	};
}
function withJoinState(rows) {
	return rows.map((row) => ({
		...row,
		...joinState(row)
	}));
}
async function getActor(req, res) {
	if (!req.user?.userId) {
		res.status(401).json({
			success: false,
			error: "Active account required"
		});
		return null;
	}
	const actor = (await query("SELECT id, email, role, is_active, admin_permissions FROM users WHERE id = $1", [req.user.userId])).rows[0];
	if (!actor?.is_active) {
		res.status(401).json({
			success: false,
			error: "Active account required"
		});
		return null;
	}
	if (actor.role === "admin" && !isPrimaryAdmin(actor.email) && !normalizeAdminPermissions(actor.admin_permissions).liveClasses) {
		res.status(403).json({
			success: false,
			error: "You do not have permission to manage live classes"
		});
		return null;
	}
	return actor;
}
function canManageClass(actor, row) {
	return actor.role === "admin" || actor.role === "teacher" && String(row.teacher_id) === String(actor.id);
}
async function isEnrolled(studentId, courseId) {
	return (await query("SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2", [studentId, courseId])).rows.length > 0;
}
function classIsActive(row) {
	return row.status === "active" && Date.now() <= new Date(row.scheduled_end).getTime();
}
var getLiveClasses = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		const { course_id } = req.query;
		const params = [];
		const where = [];
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
		} else if (actor.role !== "admin") return res.status(403).json({
			success: false,
			error: "Live class access required"
		});
		if (course_id) {
			params.push(String(course_id));
			where.push(`lc.course_id = $${params.length}`);
		}
		if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
		sql += " ORDER BY lc.scheduled_start ASC";
		const result = await query(sql, params);
		res.json({
			success: true,
			data: withJoinState(result.rows),
			message: "Live classes fetched successfully"
		});
	} catch (error) {
		console.error("Error fetching live classes:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch live classes"
		});
	}
};
var createLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		if (actor.role !== "teacher" && actor.role !== "admin") return res.status(403).json({
			success: false,
			error: "Teacher access required"
		});
		const { course_id, teacher_id, title, description, scheduled_start, scheduled_end } = req.body;
		if (!course_id || !title || !scheduled_start || !scheduled_end) return res.status(400).json({
			success: false,
			error: "Course, title, start time, and end time are required"
		});
		if (new Date(scheduled_start).getTime() >= new Date(scheduled_end).getTime()) return res.status(400).json({
			success: false,
			error: "End time must be after start time"
		});
		const course = (await query("SELECT id, instructor_id FROM courses WHERE id = $1", [course_id])).rows[0];
		if (!course) return res.status(404).json({
			success: false,
			error: "Course not found"
		});
		if (actor.role === "teacher" && String(course.instructor_id) !== String(actor.id)) return res.status(403).json({
			success: false,
			error: "You can only schedule classes for your assigned courses"
		});
		const created = await query(`INSERT INTO live_classes (
        course_id,
        teacher_id,
        title,
        description,
        scheduled_start,
        scheduled_end,
        room_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`, [
			course_id,
			actor.role === "teacher" ? actor.id : teacher_id || course.instructor_id || null,
			String(title).trim(),
			description ? String(description).trim() : null,
			scheduled_start,
			scheduled_end,
			roomId()
		]);
		res.status(201).json({
			success: true,
			data: withJoinState(created.rows)[0],
			message: "Live class scheduled successfully"
		});
	} catch (error) {
		console.error("Error creating live class:", error);
		res.status(500).json({
			success: false,
			error: "Failed to create live class"
		});
	}
};
var updateLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		if (actor.role !== "admin") return res.status(403).json({
			success: false,
			error: "Admin access required"
		});
		const { id } = req.params;
		const { course_id, teacher_id, title, description, scheduled_start, scheduled_end, status } = req.body;
		if (status && ![
			"scheduled",
			"cancelled",
			"completed"
		].includes(status)) return res.status(400).json({
			success: false,
			error: "Invalid live class status"
		});
		const result = await query(`UPDATE live_classes
       SET course_id = COALESCE($1, course_id),
           teacher_id = CASE WHEN $2 THEN $3 ELSE teacher_id END,
           title = COALESCE($4, title),
           description = CASE WHEN $5 THEN $6 ELSE description END,
           scheduled_start = COALESCE($7, scheduled_start),
           scheduled_end = COALESCE($8, scheduled_end),
           status = COALESCE($9, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`, [
			course_id || null,
			Object.prototype.hasOwnProperty.call(req.body, "teacher_id"),
			teacher_id || null,
			title ? String(title).trim() : null,
			Object.prototype.hasOwnProperty.call(req.body, "description"),
			description ? String(description).trim() : null,
			scheduled_start || null,
			scheduled_end || null,
			status || null,
			id
		]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Live class not found"
		});
		res.json({
			success: true,
			data: withJoinState(result.rows)[0],
			message: "Live class updated successfully"
		});
	} catch (error) {
		console.error("Error updating live class:", error);
		res.status(500).json({
			success: false,
			error: "Failed to update live class"
		});
	}
};
var deleteLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		if (actor.role !== "admin") return res.status(403).json({
			success: false,
			error: "Admin access required"
		});
		const { id } = req.params;
		const result = await query("DELETE FROM live_classes WHERE id = $1 RETURNING id", [id]);
		if (result.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Live class not found"
		});
		res.json({
			success: true,
			data: { id: result.rows[0].id },
			message: "Live class deleted successfully"
		});
	} catch (error) {
		console.error("Error deleting live class:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete live class"
		});
	}
};
var startLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		if (!["teacher", "admin"].includes(actor.role)) return res.status(403).json({
			success: false,
			error: "Teacher access required"
		});
		if (!process.env.ZOOM_VIDEO_SDK_KEY || !process.env.ZOOM_VIDEO_SDK_SECRET) return res.status(503).json({
			success: false,
			error: "Zoom Video SDK is not configured. Set ZOOM_VIDEO_SDK_KEY and ZOOM_VIDEO_SDK_SECRET on the server."
		});
		const row = (await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id])).rows[0];
		if (!row) return res.status(404).json({
			success: false,
			error: "Live class not found"
		});
		if (!canManageClass(actor, row)) return res.status(403).json({
			success: false,
			error: "Only the assigned teacher can start this class"
		});
		if (row.status === "active") return res.json({
			success: true,
			data: withJoinState([row])[0]
		});
		if (row.status !== "scheduled") return res.status(409).json({
			success: false,
			error: "This class can no longer be started"
		});
		const now = Date.now();
		if (now < new Date(row.scheduled_start).getTime() - joinWindowMinutes * 6e4 || now > new Date(row.scheduled_end).getTime()) return res.status(409).json({
			success: false,
			error: "This class is outside its scheduled start window"
		});
		const started = await query(`UPDATE live_classes
       SET status = 'active', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'scheduled'
       RETURNING *`, [req.params.id]);
		if (started.rows.length === 0) return res.status(409).json({
			success: false,
			error: "This class is already active or has ended"
		});
		res.json({
			success: true,
			data: withJoinState(started.rows)[0]
		});
	} catch (error) {
		if (error?.code === "23505") return res.status(409).json({
			success: false,
			error: "Another class for this course is already active"
		});
		console.error("Error starting live class:", error);
		res.status(500).json({
			success: false,
			error: "Unable to start live class"
		});
	}
};
var endLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		if (!["teacher", "admin"].includes(actor.role)) return res.status(403).json({
			success: false,
			error: "Teacher access required"
		});
		const row = (await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id])).rows[0];
		if (!row) return res.status(404).json({
			success: false,
			error: "Live class not found"
		});
		if (!canManageClass(actor, row)) return res.status(403).json({
			success: false,
			error: "Only the assigned teacher can end this class"
		});
		if (row.status === "completed") return res.json({
			success: true,
			data: row
		});
		if (row.status !== "active") return res.status(409).json({
			success: false,
			error: "Only an active class can be ended"
		});
		await query(`UPDATE live_class_attendance
       SET left_at = CURRENT_TIMESTAMP,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at))::int)
       WHERE live_class_id = $1 AND left_at IS NULL`, [req.params.id]);
		const ended = await query(`UPDATE live_classes
       SET status = 'completed', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'active'
       RETURNING *`, [req.params.id]);
		res.json({
			success: true,
			data: ended.rows[0]
		});
	} catch (error) {
		console.error("Error ending live class:", error);
		res.status(500).json({
			success: false,
			error: "Unable to end live class"
		});
	}
};
var getLiveClassStatus = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		const row = (await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id])).rows[0];
		if (!row) return res.status(404).json({
			success: false,
			error: "Live class not found"
		});
		if (actor.role === "teacher" && !canManageClass(actor, row)) return res.status(403).json({
			success: false,
			error: "Only the assigned teacher can access this class"
		});
		if (actor.role === "student" && !await isEnrolled(actor.id, row.course_id)) return res.status(403).json({
			success: false,
			error: "Only enrolled students can access this class"
		});
		if (![
			"admin",
			"teacher",
			"student"
		].includes(actor.role)) return res.status(403).json({
			success: false,
			error: "Live class access required"
		});
		const status = row.status === "active" && Date.now() > new Date(row.scheduled_end).getTime() ? "completed" : row.status;
		res.json({
			success: true,
			data: {
				id: row.id,
				status
			}
		});
	} catch (error) {
		console.error("Error fetching live class status:", error);
		res.status(500).json({
			success: false,
			error: "Unable to check live class status"
		});
	}
};
var joinLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		const liveClass = await query(`${liveClassSelect} WHERE lc.id = $1`, [req.params.id]);
		if (liveClass.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Live class not found"
		});
		const row = liveClass.rows[0];
		const state = joinState(row);
		if (actor.role === "student" && !await isEnrolled(actor.id, row.course_id)) return res.status(403).json({
			success: false,
			error: "Only enrolled students can join this class"
		});
		if (actor.role === "teacher" && !canManageClass(actor, row)) return res.status(403).json({
			success: false,
			error: "Only the assigned teacher can host this class"
		});
		if (![
			"admin",
			"teacher",
			"student"
		].includes(actor.role)) return res.status(403).json({
			success: false,
			error: "Live class access required"
		});
		if (!classIsActive(row)) return res.status(409).json({
			success: false,
			error: row.status === "scheduled" ? "The teacher has not started this class yet" : "This class is not active"
		});
		if (Date.now() < new Date(row.scheduled_start).getTime() - joinWindowMinutes * 6e4) return res.status(409).json({
			success: false,
			error: "This class is not open yet"
		});
		const attendance = await query("INSERT INTO live_class_attendance (live_class_id, user_id, role) VALUES ($1, $2, $3) RETURNING *", [
			req.params.id,
			actor.id,
			actor.role
		]);
		const participants = await query(`SELECT DISTINCT ON (a.user_id)
         a.user_id,
         u.full_name,
         a.role
       FROM live_class_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.live_class_id = $1 AND a.left_at IS NULL
       ORDER BY a.user_id, a.joined_at DESC`, [req.params.id]);
		res.json({
			success: true,
			data: {
				live_class: {
					...row,
					...state
				},
				attendance: attendance.rows[0],
				participants: participants.rows,
				room: {
					room_id: row.room_id,
					meeting_id: row.meeting_id,
					signaling_url: `/api/live-classes/${req.params.id}/join`
				}
			},
			message: "Live class joined successfully"
		});
	} catch (error) {
		console.error("Error joining live class:", error);
		res.status(500).json({
			success: false,
			error: "Failed to join live class"
		});
	}
};
var leaveLiveClass = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		const { attendance_id } = req.body;
		if (!attendance_id) return res.status(400).json({
			success: false,
			error: "Attendance id is required"
		});
		const result = await query(`UPDATE live_class_attendance
       SET left_at = CURRENT_TIMESTAMP,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - joined_at))::int)
         WHERE id = $1 AND user_id = $2 AND left_at IS NULL
       RETURNING *`, [attendance_id, actor.id]);
		res.json({
			success: true,
			data: result.rows[0] || null,
			message: "Live class left successfully"
		});
	} catch (error) {
		console.error("Error leaving live class:", error);
		res.status(500).json({
			success: false,
			error: "Failed to leave live class"
		});
	}
};
/** Creates a short-lived Zoom Video SDK JWT. The SDK secret never leaves the server. */
var createVideoSdkToken = async (req, res) => {
	try {
		const actor = await getActor(req, res);
		if (!actor) return;
		const { id } = req.params;
		const sdkKey = process.env.ZOOM_VIDEO_SDK_KEY;
		const sdkSecret = process.env.ZOOM_VIDEO_SDK_SECRET;
		if (!sdkKey || !sdkSecret) return res.status(503).json({
			success: false,
			error: "Zoom Video SDK is not configured. Add ZOOM_VIDEO_SDK_KEY and ZOOM_VIDEO_SDK_SECRET to the server environment."
		});
		if (![
			"teacher",
			"student",
			"admin"
		].includes(actor.role)) return res.status(403).json({
			success: false,
			error: "Live class access required."
		});
		const liveClass = await query(`${liveClassSelect} WHERE lc.id = $1`, [id]);
		if (liveClass.rows.length === 0) return res.status(404).json({
			success: false,
			error: "Live class not found."
		});
		const row = liveClass.rows[0];
		if (actor.role === "teacher" && !canManageClass(actor, row)) return res.status(403).json({
			success: false,
			error: "Only the assigned teacher can host this meeting."
		});
		if (actor.role === "student" && !await isEnrolled(actor.id, row.course_id)) return res.status(403).json({
			success: false,
			error: "Only enrolled students can join this meeting."
		});
		if (!classIsActive(row) || Date.now() < new Date(row.scheduled_start).getTime() - joinWindowMinutes * 6e4) return res.status(409).json({
			success: false,
			error: "This class is not active or is outside its scheduled window."
		});
		const now = Math.floor(Date.now() / 1e3);
		const topic = String(row.meeting_id || row.room_id);
		const token = jwt.sign({
			app_key: sdkKey,
			role_type: actor.role === "teacher" ? 1 : 0,
			tpc: topic,
			user_identity: String(actor.id),
			version: 1,
			iat: now,
			exp: now + 3600
		}, sdkSecret, { algorithm: "HS256" });
		res.json({
			success: true,
			data: {
				token,
				topic,
				role: actor.role === "teacher" ? 1 : 0
			},
			message: "Zoom Video SDK token generated successfully."
		});
	} catch (error) {
		console.error("Error generating Zoom Video SDK token:", error);
		res.status(500).json({
			success: false,
			error: "Unable to authorize Zoom Video SDK."
		});
	}
};
// server/routes/paymentSettings.ts
var paymentSettingsSchema = z.object({
	bank_name: z.string().max(255),
	account_name: z.string().max(255),
	account_number: z.string().max(255),
	iban: z.string().max(255),
	routing_code: z.string().max(255),
	instructions: z.string().max(5e3)
});
var selectSettings = `
  SELECT bank_name, account_name, account_number, iban, routing_code, instructions, updated_at
  FROM payment_settings
  WHERE id = 1
`;
var getPaymentSettings = async (_req, res) => {
	try {
		return sendSuccess(res, (await query(selectSettings)).rows[0] ?? null);
	} catch (error) {
		console.error("Unable to fetch payment settings:", error);
		return sendError(res, "Unable to fetch payment settings", 500);
	}
};
var updatePaymentSettings = async (req, res) => {
	const parsed = paymentSettingsSchema.safeParse(req.body);
	if (!parsed.success) return sendError(res, "Invalid bank-transfer settings", 400);
	try {
		return sendSuccess(res, (await query(`UPDATE payment_settings
       SET bank_name = $1,
           account_name = $2,
           account_number = $3,
           iban = $4,
           routing_code = $5,
           instructions = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING bank_name, account_name, account_number, iban, routing_code, instructions, updated_at`, [
			parsed.data.bank_name.trim(),
			parsed.data.account_name.trim(),
			parsed.data.account_number.trim(),
			parsed.data.iban.trim(),
			parsed.data.routing_code.trim(),
			parsed.data.instructions.trim()
		])).rows[0], "Payment settings updated");
	} catch (error) {
		console.error("Unable to update payment settings:", error);
		return sendError(res, "Unable to update payment settings", 500);
	}
};
// server/routes/rewards.ts
var coinsPerClass = 20;
var fullWeekBonus = 100;
var getStudentRewards = async (req, res) => {
	const studentId = req.params.id;
	if (typeof studentId !== "string" || !studentId) return sendError(res, "A valid student id is required", 400);
	if (!req.user || !await canAccessStudentData(req.user, studentId, void 0, "users")) return sendError(res, "Student rewards access required", 403);
	if (!isDatabaseConfigured) return sendSuccess(res, {
		totalCoins: 0,
		classCoins: 0,
		bonusCoins: 0,
		attendedClasses: 0,
		completedWeeks: 0,
		coinsPerClass,
		fullWeekBonus
	}, "Student rewards fetched successfully");
	try {
		const attendanceResult = await query(`
        SELECT COUNT(DISTINCT live_class_id)::int AS attended_classes
        FROM live_class_attendance
        WHERE user_id = $1 AND role = 'student'
      `, [studentId]);
		const attendedClasses = Number(attendanceResult.rows[0]?.attended_classes ?? 0);
		const completedWeeks = Math.floor(attendedClasses / 5);
		const classCoins = attendedClasses * coinsPerClass;
		const bonusCoins = completedWeeks * fullWeekBonus;
		return sendSuccess(res, {
			totalCoins: classCoins + bonusCoins,
			classCoins,
			bonusCoins,
			attendedClasses,
			completedWeeks,
			coinsPerClass,
			fullWeekBonus
		}, "Student rewards fetched successfully");
	} catch (error) {
		console.error("Error fetching student rewards:", error);
		return sendError(res, "Failed to fetch student rewards", 500);
	}
};
// server/routes/adminPermissions.ts
var getMyPermissions = async (req, res) => {
	try {
		const user = (await query("SELECT email, role, admin_permissions FROM users WHERE id = $1", [req.user?.userId])).rows[0];
		if (!user || user.role !== "admin") return sendError(res, "Admin access required", 403);
		return sendSuccess(res, {
			email: user.email,
			isPrimaryAdmin: isPrimaryAdmin(user.email),
			permissions: isPrimaryAdmin(user.email) ? ALL_ADMIN_PERMISSIONS : normalizeAdminPermissions(user.admin_permissions)
		});
	} catch (error) {
		console.error("Unable to fetch admin permissions:", error);
		return sendError(res, "Unable to fetch admin permissions", 500);
	}
};
var getCoAdmins = async (_req, res) => {
	try {
		return sendSuccess(res, (await query(`SELECT id, email, full_name, admin_permissions
       FROM users
       WHERE role = 'admin' AND NOT (lower(email) = ANY($1::text[]))
       ORDER BY created_at ASC`, [[...PRIMARY_ADMIN_EMAILS]])).rows.map((user) => ({
			id: user.id,
			email: user.email,
			full_name: user.full_name,
			permissions: normalizeAdminPermissions(user.admin_permissions)
		})));
	} catch (error) {
		console.error("Unable to fetch co-admins:", error);
		return sendError(res, "Unable to fetch co-admins", 500);
	}
};
var updateCoAdminPermissions = async (req, res) => {
	const parsed = adminPermissionsSchema.safeParse(req.body?.permissions);
	if (!parsed.success) return sendError(res, "Provide a boolean setting for every admin area", 400);
	try {
		const user = (await query(`UPDATE users
       SET admin_permissions = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND role = 'admin'
         AND NOT (lower(email) = ANY($3::text[]))
       RETURNING id, email, full_name, admin_permissions`, [
			JSON.stringify(parsed.data),
			req.params.id,
			[...PRIMARY_ADMIN_EMAILS]
		])).rows[0];
		if (!user) return sendError(res, "Co-admin not found", 404);
		return sendSuccess(res, {
			id: user.id,
			email: user.email,
			full_name: user.full_name,
			permissions: normalizeAdminPermissions(user.admin_permissions)
		}, "Co-admin access updated");
	} catch (error) {
		console.error("Unable to update co-admin permissions:", error);
		return sendError(res, "Unable to update co-admin access", 500);
	}
};
// server/routes/deals.ts
var cleanCode = (value) => String(value ?? "").trim().toUpperCase();
var getBundles = async (_req, res) => {
	try {
		const result = await query(`SELECT b.*, COALESCE(json_agg(json_build_object('id', c.id, 'title', c.title, 'price_cents', c.price_cents) ORDER BY c.title) FILTER (WHERE c.id IS NOT NULL), '[]') AS courses
      FROM bundle_deals b LEFT JOIN bundle_deal_courses bc ON bc.bundle_id = b.id LEFT JOIN courses c ON c.id = bc.course_id
      GROUP BY b.id ORDER BY b.created_at DESC`);
		res.json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error("Error fetching bundles:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch bundles"
		});
	}
};
var createBundle = async (req, res) => {
	const { name, description, price_cents, course_ids, starts_at, ends_at, is_active = true } = req.body;
	if (!String(name || "").trim() || !Number.isInteger(Number(price_cents)) || Number(price_cents) < 0 || !Array.isArray(course_ids) || course_ids.length < 2) return res.status(400).json({
		success: false,
		error: "Name, a non-negative price, and at least two courses are required"
	});
	if (starts_at && ends_at && new Date(starts_at) >= new Date(ends_at)) return res.status(400).json({
		success: false,
		error: "End date must be after the start date"
	});
	try {
		const bundle = await query("INSERT INTO bundle_deals (name, description, price_cents, starts_at, ends_at, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [
			String(name).trim(),
			description || null,
			Number(price_cents),
			starts_at || null,
			ends_at || null,
			Boolean(is_active)
		]);
		for (const courseId of [...new Set(course_ids.map(String))]) await query("INSERT INTO bundle_deal_courses (bundle_id, course_id) VALUES ($1,$2)", [bundle.rows[0].id, courseId]);
		res.status(201).json({
			success: true,
			data: bundle.rows[0],
			message: "Bundle deal created"
		});
	} catch (error) {
		console.error("Error creating bundle:", error);
		res.status(error?.code === "23503" ? 400 : 500).json({
			success: false,
			error: error?.code === "23503" ? "One or more courses do not exist" : "Failed to create bundle"
		});
	}
};
var deleteBundle = async (req, res) => {
	try {
		const result = await query("DELETE FROM bundle_deals WHERE id = $1 RETURNING id", [req.params.id]);
		if (!result.rows.length) return res.status(404).json({
			success: false,
			error: "Bundle not found"
		});
		res.json({
			success: true,
			data: result.rows[0]
		});
	} catch (error) {
		console.error("Error deleting bundle:", error);
		res.status(500).json({
			success: false,
			error: "Failed to delete bundle"
		});
	}
};
var updateBundle = async (req, res) => {
	const { name, description, price_cents, course_ids, starts_at, ends_at, is_active } = req.body;
	if (starts_at && ends_at && new Date(starts_at) >= new Date(ends_at)) return res.status(400).json({
		success: false,
		error: "End date must be after the start date"
	});
	try {
		const result = await query("UPDATE bundle_deals SET name = COALESCE($1, name), description = CASE WHEN $8 THEN $2 ELSE description END, price_cents = COALESCE($3, price_cents), starts_at = CASE WHEN $9 THEN $4 ELSE starts_at END, ends_at = CASE WHEN $10 THEN $5 ELSE ends_at END, is_active = COALESCE($6, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *", [
			name?.trim() || null,
			description || null,
			price_cents === void 0 ? null : Number(price_cents),
			starts_at || null,
			ends_at || null,
			is_active === void 0 ? null : Boolean(is_active),
			req.params.id,
			Object.prototype.hasOwnProperty.call(req.body, "description"),
			Object.prototype.hasOwnProperty.call(req.body, "starts_at"),
			Object.prototype.hasOwnProperty.call(req.body, "ends_at")
		]);
		if (!result.rows.length) return res.status(404).json({
			success: false,
			error: "Bundle not found"
		});
		if (Array.isArray(course_ids)) {
			await query("DELETE FROM bundle_deal_courses WHERE bundle_id = $1", [req.params.id]);
			for (const courseId of [...new Set(course_ids.map(String))]) await query("INSERT INTO bundle_deal_courses (bundle_id, course_id) VALUES ($1,$2)", [req.params.id, courseId]);
		}
		res.json({
			success: true,
			data: result.rows[0],
			message: "Bundle updated"
		});
	} catch (error) {
		console.error("Error updating bundle:", error);
		res.status(500).json({
			success: false,
			error: "Failed to update bundle"
		});
	}
};
var getPromoCodes = async (_req, res) => {
	try {
		const result = await query("SELECT * FROM promo_codes ORDER BY created_at DESC");
		res.json({
			success: true,
			data: result.rows
		});
	} catch (error) {
		console.error("Error fetching promo codes:", error);
		res.status(500).json({
			success: false,
			error: "Failed to fetch promo codes"
		});
	}
};
var createPromoCode = async (req, res) => {
	const code = cleanCode(req.body.code);
	const type = req.body.discount_type;
	const value = Number(req.body.discount_value);
	if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !["percent", "fixed"].includes(type) || !Number.isInteger(value) || value <= 0 || type === "percent" && value > 100) return res.status(400).json({
		success: false,
		error: "Use a valid code and discount (percent 1-100 or fixed amount in cents)"
	});
	if (req.body.starts_at && req.body.ends_at && new Date(req.body.starts_at) >= new Date(req.body.ends_at)) return res.status(400).json({
		success: false,
		error: "End date must be after start date"
	});
	try {
		const result = await query("INSERT INTO promo_codes (code, discount_type, discount_value, starts_at, ends_at, max_redemptions, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [
			code,
			type,
			value,
			req.body.starts_at || null,
			req.body.ends_at || null,
			req.body.max_redemptions ? Number(req.body.max_redemptions) : null,
			req.body.is_active !== false
		]);
		res.status(201).json({
			success: true,
			data: result.rows[0],
			message: "Promo code created"
		});
	} catch (error) {
		res.status(error?.code === "23505" ? 409 : 500).json({
			success: false,
			error: error?.code === "23505" ? "That promo code already exists" : "Failed to create promo code"
		});
	}
};
var updatePromoCode = async (req, res) => {
	try {
		const result = await query("UPDATE promo_codes SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *", [Boolean(req.body.is_active), req.params.id]);
		if (!result.rows.length) return res.status(404).json({
			success: false,
			error: "Promo code not found"
		});
		res.json({
			success: true,
			data: result.rows[0]
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Failed to update promo code"
		});
	}
};
var deletePromoCode = async (req, res) => {
	try {
		const result = await query("DELETE FROM promo_codes WHERE id = $1 RETURNING id", [req.params.id]);
		if (!result.rows.length) return res.status(404).json({
			success: false,
			error: "Promo code not found"
		});
		res.json({
			success: true,
			data: result.rows[0]
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Failed to delete promo code"
		});
	}
};
// server/index.ts
var shouldInitializeDatabase = !process.env.VERCEL && process.env.INITIALIZE_DATABASE_ON_STARTUP === "true";
var initializationPromise;
var enrollmentCleanupTimer;
function sendJson(res, status, body) {
	return res.status(status).json(body);
}
function initializeServer() {
	if (!initializationPromise) initializationPromise = (async () => {
		if (!isDatabaseConfigured) throw new Error("DATABASE_URL must be configured in production.");
		if (shouldInitializeDatabase) {
			await initializeDatabase();
			await initializeAuthSchema();
			await initializeContactSchema();
		}
		if (!await hasRequiredSchema()) throw new Error("Database schema is not initialized. Apply production migrations before startup.");
	})();
	return initializationPromise;
}
async function hasRequiredSchema() {
	const tables = (await query(`SELECT to_regclass('public.users') AS users_table,
            to_regclass('public.courses') AS courses_table,
            to_regclass('public.auth_sessions') AS sessions_table,
            to_regclass('public.password_reset_tokens') AS reset_tokens_table,
            to_regclass('public.contact_messages') AS contact_messages_table`)).rows[0];
	return Boolean(tables?.users_table && tables?.courses_table && tables?.sessions_table && tables?.reset_tokens_table && tables?.contact_messages_table);
}
function getCorsOrigin() {
	const configured = process.env.CORS_ORIGIN;
	if (!configured) throw new Error("CORS_ORIGIN must be configured in production.");
	const origins = configured.split(",").map((value) => value.trim());
	if (origins.some((origin) => !origin || origin === "*")) throw new Error("CORS_ORIGIN must be a comma-separated list of explicit origins.");
	for (const origin of origins) {
		let parsed;
		try {
			parsed = new URL(origin);
		} catch {
			throw new Error("CORS_ORIGIN contains an invalid origin.");
		}
		if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) throw new Error("CORS_ORIGIN entries must be exact HTTP or HTTPS origins.");
	}
	return origins;
}
function createServer() {
	const hasSupabaseServerKey = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
	const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
	if (!enrollmentCleanupTimer && hasSupabaseServerKey && hasSupabaseUrl) {
		enrollmentCleanupTimer = setInterval(() => {
			retryEnrollmentReceiptCleanup().catch((error) => {
				console.error("Automatic enrollment receipt cleanup retry failed:", error);
			});
		}, 6e4);
		enrollmentCleanupTimer.unref();
	}
	const app = express();
	app.use(cors({
		origin: getCorsOrigin(),
		credentials: true
	}));
	app.use(express.json({ limit: "10mb" }));
	app.use(express.urlencoded({
		extended: true,
		limit: "32kb",
		parameterLimit: 100
	}));
	const apiRouter = express.Router();
	apiRouter.get("/keep-alive", async (_req, res) => {
		try {
			const start = Date.now();
			await query("SELECT 1 AS keep_alive");
			const latency = Date.now() - start;
			res.json({
				success: true,
				message: "Database keep-alive successful",
				latency_ms: latency,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
		} catch (error) {
			console.error("Keep-alive failed:", error);
			res.status(500).json({
				success: false,
				error: "Database is temporarily unavailable",
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
	});
	apiRouter.get("/ping", (_req, res) => {
		const ping = process.env.PING_MESSAGE ?? "pong";
		res.json({
			success: true,
			message: ping
		});
	});
	apiRouter.get("/demo", handleDemo);
	apiRouter.post("/contact", submitContactMessage);
	apiRouter.use("/auth", authRouter);
	apiRouter.get("/admin/permissions/me", requireAuth, getMyPermissions);
	apiRouter.get("/deals/bundles", getBundles);
	apiRouter.get("/deals/promo-codes", requireAuth, requireAdminFeature("deals"), getPromoCodes);
	apiRouter.post("/deals/bundles", requireAuth, requireAdminFeature("deals"), createBundle);
	apiRouter.patch("/deals/bundles/:id", requireAuth, requireAdminFeature("deals"), updateBundle);
	apiRouter.delete("/deals/bundles/:id", requireAuth, requireAdminFeature("deals"), deleteBundle);
	apiRouter.post("/deals/promo-codes", requireAuth, requireAdminFeature("deals"), createPromoCode);
	apiRouter.patch("/deals/promo-codes/:id", requireAuth, requireAdminFeature("deals"), updatePromoCode);
	apiRouter.delete("/deals/promo-codes/:id", requireAuth, requireAdminFeature("deals"), deletePromoCode);
	apiRouter.get("/admin/co-admins", requireAuth, requirePrimaryAdmin, getCoAdmins);
	apiRouter.put("/admin/co-admins/:id", requireAuth, requirePrimaryAdmin, updateCoAdminPermissions);
	apiRouter.get("/platform-stats", requireAuth, requireAdminFeature("overview"), getPlatformStats);
	apiRouter.get("/students/:id/rewards", requireAuth, getStudentRewards);
	apiRouter.get("/users", requireAuth, requireAdminFeature("users"), getUsers);
	apiRouter.get("/users/:id", requireAuth, requireAdminSelfOrUserManagement, getUserById);
	apiRouter.post("/users", requireAuth, requireAdminFeature("users"), createUser);
	apiRouter.put("/users/:id", requireAuth, requireAdminSelfOrUserManagement, updateUser);
	apiRouter.delete("/users/:id", requireAuth, requireAdminFeature("users"), deleteUser);
	apiRouter.get("/courses", getCourses);
	apiRouter.get("/instructors", requireAuth, requireAdminFeature("courses"), async (_req, res) => {
		try {
			const result = await query("SELECT id, full_name FROM users WHERE role = 'teacher' AND is_active = true ORDER BY full_name");
			res.json({
				success: true,
				data: result.rows
			});
		} catch {
			res.status(500).json({
				success: false,
				error: "Unable to load instructors"
			});
		}
	});
	apiRouter.get("/courses/:id", getCourseById);
	apiRouter.post("/courses", requireAuth, requireAdminFeature("courses"), createCourse);
	apiRouter.put("/courses/:id", requireAuth, requireAdminFeature("courses"), updateCourse);
	apiRouter.delete("/courses/:id", requireAuth, requireAdminFeature("courses"), deleteCourse);
	apiRouter.get("/enrollments", requireAuth, getEnrollments);
	apiRouter.post("/enrollments", requireAuth, enrollStudent);
	apiRouter.delete("/enrollments/:id", requireAuth, requireAdminFeature("enrollmentRequests"), deleteEnrollment);
	apiRouter.get("/enrollment-requests", requireAuth, requireAdminFeature("enrollmentRequests"), getEnrollmentRequests);
	apiRouter.post("/enrollment-requests", requireAuth, createEnrollmentRequest);
	apiRouter.get("/enrollment-requests/:id/receipt", requireAuth, requireAdminFeature("enrollmentRequests"), getEnrollmentReceiptUrl);
	apiRouter.post("/enrollment-requests/:id/retry-cleanup", requireAuth, requireAdminFeature("enrollmentRequests"), retryEnrollmentRequestCleanup);
	apiRouter.patch("/enrollment-requests/:id", requireAuth, requireAdminFeature("enrollmentRequests"), reviewEnrollmentRequest);
	apiRouter.get("/tutor-applications", requireAuth, requireAdminFeature("tutorApplications"), getTutorApplications);
	apiRouter.post("/tutor-applications", createTutorApplication);
	apiRouter.patch("/tutor-applications/:id", requireAuth, requireAdminFeature("tutorApplications"), reviewTutorApplication);
	apiRouter.get("/categories", getCategories);
	apiRouter.get("/categories/:slug", getCategoryBySlug);
	apiRouter.post("/categories", requireAuth, requireAdminFeature("courses"), createCategory);
	apiRouter.put("/categories/:id", requireAuth, requireAdminFeature("courses"), updateCategory);
	apiRouter.delete("/categories/:id", requireAuth, requireAdminFeature("courses"), deleteCategory);
	apiRouter.post("/course-categories", requireAuth, requireAdminFeature("courses"), assignCategoryToCourse);
	apiRouter.delete("/courses/:course_id/categories/:category_id", requireAuth, requireAdminFeature("courses"), removeCategoryFromCourse);
	apiRouter.get("/courses/:course_id/categories", getCategoriesForCourse);
	apiRouter.get("/tags", getTags);
	apiRouter.get("/tags/:slug", getTagBySlug);
	apiRouter.post("/tags", requireAuth, requireAdminFeature("courses"), createTag);
	apiRouter.put("/tags/:id", requireAuth, requireAdminFeature("courses"), updateTag);
	apiRouter.delete("/tags/:id", requireAuth, requireAdminFeature("courses"), deleteTag);
	apiRouter.post("/course-tags", requireAuth, requireAdminFeature("courses"), assignTagToCourse);
	apiRouter.delete("/courses/:course_id/tags/:tag_id", requireAuth, requireAdminFeature("courses"), removeTagFromCourse);
	apiRouter.get("/courses/:course_id/tags", getTagsForCourse);
	apiRouter.get("/progress/student/:student_id", requireAuth, getStudentProgress);
	apiRouter.get("/progress/course/:course_id/student/:student_id", requireAuth, getCourseProgress);
	apiRouter.patch("/progress/lesson/:lesson_id/student/:student_id", requireAuth, updateLessonProgress);
	apiRouter.post("/progress/complete-course/:course_id/student/:student_id", requireAuth, completeCourse);
	apiRouter.get("/courses/:course_id/structure", requireAuth, getCourseStructure);
	apiRouter.get("/live-classes", requireAuth, getLiveClasses);
	apiRouter.post("/live-classes", requireAuth, createLiveClass);
	apiRouter.put("/live-classes/:id", requireAuth, updateLiveClass);
	apiRouter.delete("/live-classes/:id", requireAuth, deleteLiveClass);
	apiRouter.post("/live-classes/:id/start", requireAuth, startLiveClass);
	apiRouter.post("/live-classes/:id/end", requireAuth, endLiveClass);
	apiRouter.get("/live-classes/:id/status", requireAuth, getLiveClassStatus);
	apiRouter.post("/live-classes/:id/join", requireAuth, joinLiveClass);
	apiRouter.post("/live-classes/:id/video-sdk-token", requireAuth, createVideoSdkToken);
	apiRouter.post("/live-classes/:id/leave", requireAuth, leaveLiveClass);
	apiRouter.get("/payment-settings", getPaymentSettings);
	apiRouter.put("/payment-settings", requireAuth, requireAdminFeature("settings"), updatePaymentSettings);
	apiRouter.post("/modules", requireAuth, requireAdminFeature("courses"), createModule);
	apiRouter.put("/modules/:id", requireAuth, requireAdminFeature("courses"), updateModule);
	apiRouter.delete("/modules/:id", requireAuth, requireAdminFeature("courses"), deleteModule);
	apiRouter.post("/lessons", requireAuth, requireAdminFeature("courses"), createLesson);
	apiRouter.put("/lessons/:id", requireAuth, requireAdminFeature("courses"), updateLesson);
	apiRouter.delete("/lessons/:id", requireAuth, requireAdminFeature("courses"), deleteLesson);
	apiRouter.get("/health", async (_req, res) => {
		try {
			if (!isDatabaseConfigured || !await hasRequiredSchema()) return res.status(503).json({
				success: false,
				status: "unavailable",
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
			return res.json({
				success: true,
				status: "ready",
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
		} catch (error) {
			console.error("Readiness check failed:", error);
			return res.status(503).json({
				success: false,
				status: "unavailable",
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
	});
	apiRouter.get("/health-db", async (_req, res) => {
		const start = Date.now();
		try {
			if (!isDatabaseConfigured || !await hasRequiredSchema()) return res.status(503).json({
				success: false,
				latencyMs: Date.now() - start,
				error: "Database is not ready"
			});
			res.json({
				success: true,
				latencyMs: Date.now() - start
			});
		} catch (error) {
			console.error("Database health check failed:", error);
			res.status(500).json({
				success: false,
				latencyMs: Date.now() - start,
				error: "Database is temporarily unavailable"
			});
		}
	});
	app.use("/api", apiRouter);
	app.use("/api", (_req, res) => {
		sendJson(res, 404, {
			success: false,
			error: "Route not found"
		});
	});
	app.use((err, _req, res, _next) => {
		console.error("Unexpected server error:", err);
		sendJson(res, 500, {
			success: false,
			error: "Unexpected server error"
		});
	});
	return app;
}
// server/node-build.ts
await initializeServer();
var app = createServer();
var port = process.env.PORT || 3e3;
var __dirname = import.meta.dirname;
var distPath = path.join(__dirname, "../spa");
app.use(express.static(distPath));
app.get("/{*path}", (req, res) => {
	if (req.path.startsWith("/api/") || req.path.startsWith("/health")) return res.status(404).json({ error: "API endpoint not found" });
	res.sendFile(path.join(distPath, "index.html"));
});
app.listen(port, () => {
	console.log(`🚀 Fusion Starter server running on port ${port}`);
	console.log(`📱 Frontend: http://localhost:${port}`);
	console.log(`🔧 API: http://localhost:${port}/api`);
});
process.on("SIGTERM", () => {
	console.log("🛑 Received SIGTERM, shutting down gracefully");
	process.exit(0);
});
process.on("SIGINT", () => {
	console.log("🛑 Received SIGINT, shutting down gracefully");
	process.exit(0);
});
export {};

//# sourceMappingURL=node-build.mjs.map