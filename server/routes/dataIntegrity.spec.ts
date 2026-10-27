import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Request, RequestHandler, Response } from "express";

vi.mock("../db/connection.js", () => ({ query: vi.fn(), isDatabaseConfigured: true }));

import { query } from "../db/connection.js";
import { initializeDatabase } from "../db/schema.js";
import { getCourseById } from "./courses.js";
import { updateBundle } from "./deals.js";
import { getCourseProgress } from "./progress.js";
import { getStudentRewards } from "./rewards.js";
import { createTutorApplication, reviewTutorApplication } from "./tutorApplications.js";
import { verifyPassword } from "../utils/password.js";

const db = new PGlite();

async function request(handler: RequestHandler, values: Partial<Request>) {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  await handler({ params: {}, body: {}, ...values } as Request, res as unknown as Response, vi.fn());
  expect(res.statusCode).toBeLessThan(400);
  return res.body;
}

describe("database data integrity", () => {
  beforeAll(async () => {
    vi.mocked(query).mockImplementation(async (sql, params) => db.query(sql, params) as never);
    await initializeDatabase();
  }, 15_000);

  beforeEach(async () => {
    await db.exec(`BEGIN;
      INSERT INTO users (id, email, password_hash, full_name, role) VALUES
        (101, 'student@example.com', 'unused', 'Student', 'student'),
        (102, 'teacher@example.com', 'unused', 'Teacher', 'teacher');
      INSERT INTO courses (id, title, price_cents, is_published) VALUES (201, 'Python', 3999, false);
      INSERT INTO enrollments (student_id, course_id) VALUES (101, 201);
    `);
  });
  afterEach(async () => { await db.exec("ROLLBACK"); });
  afterAll(async () => { await db.close(); });

  it("preserves duplicate-title courses, prices, publication state and enrollments during startup", async () => {
    await db.exec(`INSERT INTO courses (id, title, price_cents, is_published) VALUES (202, 'Python', 1299, false);
      INSERT INTO enrollments (student_id, course_id) VALUES (101, 202);`);
    await initializeDatabase();
    expect((await db.query("SELECT id, price_cents, is_published FROM courses ORDER BY id")).rows).toEqual([
      { id: 201, price_cents: 3999, is_published: false },
      { id: 202, price_cents: 1299, is_published: false },
    ]);
    expect((await db.query("SELECT course_id FROM enrollments ORDER BY course_id")).rows).toEqual([
      { course_id: 201 }, { course_id: 202 },
    ]);
  });

  it("includes the actual price in course details used for checkout", async () => {
    const response = await request(getCourseById, { params: { id: "201" } });
    expect(response.data.price_cents).toBe(3999);
    expect((response.data.price_cents / 100).toFixed(2)).toBe("39.99");
  });

  it("preserves a bundle's description and schedule when toggling its active state", async () => {
    await db.exec(`INSERT INTO bundle_deals (id, name, description, price_cents, starts_at, ends_at)
      VALUES (301, 'Bundle', 'Keep this description', 1000, '2026-01-01', '2026-12-31');`);
    const original = (await db.query<{ description: string; starts_at: Date; ends_at: Date }>("SELECT description, starts_at, ends_at FROM bundle_deals WHERE id = 301")).rows[0];
    const response = await request(updateBundle, { params: { id: "301" }, body: { is_active: false } });
    expect(response.data).toMatchObject({ ...original, is_active: false });
    const cleared = await request(updateBundle, { params: { id: "301" }, body: { description: null, starts_at: null, ends_at: null } });
    expect(cleared.data).toMatchObject({ description: null, starts_at: null, ends_at: null });
  });

  it("returns rounded fractional progress and zero for courses without lessons", async () => {
    const actor = { userId: 101, email: "student@example.com", role: "student" };
    const target = { params: { student_id: "101", course_id: "201" }, user: actor };
    const empty = await request(getCourseProgress, target);
    expect(Number(empty.data.progress_percentage)).toBe(0);
    await db.exec(`INSERT INTO course_modules (id, course_id, title, order_index) VALUES (401, 201, 'Module', 1);
      INSERT INTO course_lessons (id, module_id, title, content_type, order_index) VALUES
        (501, 401, 'First', 'text', 1), (502, 401, 'Second', 'text', 2), (503, 401, 'Third', 'text', 3);
      INSERT INTO lesson_progress (student_id, lesson_id, is_completed) VALUES (101, 501, true);`);
    const response = await request(getCourseProgress, target);
    expect(Number(response.data.progress_percentage)).toBe(33.33);
  });

  it("awards live attendance once per class and excludes absent legacy records", async () => {
    await db.exec(`INSERT INTO attendance (student_id, course_id, is_present) VALUES (101, 201, false);
      INSERT INTO live_classes (id, course_id, title, scheduled_start, scheduled_end, room_id)
        VALUES (601, 201, 'Class', '2026-01-01 10:00', '2026-01-01 11:00', 'room');
      INSERT INTO live_class_attendance (live_class_id, user_id, role) VALUES
        (601, 101, 'student'), (601, 101, 'student'), (601, 102, 'teacher');`);
    const response = await request(getStudentRewards, {
      params: { id: "101" }, user: { userId: 101, email: "student@example.com", role: "student" },
    });
    expect(response.data).toMatchObject({ attendedClasses: 1, totalCoins: 20 });
  });

  it("stores a completed password hash when a tutor applies", async () => {
    await request(createTutorApplication, { body: {
      full_name: "New Tutor", email: "tutor@example.com", expertise: "Math", experience_years: 2,
      bio: "An experienced mathematics teacher.", password: "example-password",
    } });
    const result = await db.query<{ password_hash: string }>("SELECT password_hash FROM tutor_applications WHERE email = 'tutor@example.com'");
    expect(await verifyPassword("example-password", result.rows[0].password_hash)).toBe(true);
    expect(await verifyPassword("different-password", result.rows[0].password_hash)).toBe(false);
  });

  it("records the authenticated tutor reviewer instead of a client-supplied identity", async () => {
    await db.exec(`INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES (103, 'admin@example.com', 'unused', 'Admin', 'admin');
      INSERT INTO tutor_applications (id, full_name, email, expertise, bio, password_hash)
      VALUES (701, 'Teacher', 'teacher@example.com', 'Math', 'Experienced teacher', 'unused');`);
    const response = await request(reviewTutorApplication, {
      params: { id: "701" }, body: { status: "approved", reviewed_by: 102 },
      user: { userId: 103, email: "admin@example.com", role: "admin" },
    });
    expect(response.data).toMatchObject({ status: "approved", reviewed_by: 103 });
  });
});
