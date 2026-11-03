import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Request, RequestHandler, Response } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/connection.js", () => ({ query: vi.fn() }));
vi.mock("../utils/adminPermissionMiddleware.js", () => ({ hasAdminFeatureAccess: vi.fn() }));
import { query } from "../db/connection.js";
import { hasAdminFeatureAccess } from "../utils/adminPermissionMiddleware.js";
import { getCourseZoomLinks, updateCourseZoomLink } from "./courseZoom.js";

let db: PGlite;
const meeting = "https://us02web.zoom.us/j/123456789?pwd=example";
const migration = readFileSync(new URL("../db/migrations/20261030_course_zoom_link.sql", import.meta.url), "utf8");
const actor = (role: string, userId: number) => ({ role, userId, email: "test@example.test" });

async function invoke(handler: RequestHandler, values: Partial<Request> = {}) {
  const response = {
    statusCode: 200, body: undefined as any, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    set(name: string, value: string) { this.headers[name] = value; return this; },
  };
  await handler({ params: { id: "1" }, body: { zoom_link: meeting }, ...values } as Request, response as unknown as Response, vi.fn());
  return response;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE courses (id INTEGER PRIMARY KEY, instructor_id INTEGER, title TEXT, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE enrollments (student_id INTEGER, course_id INTEGER);`);
  await db.exec(migration);
  vi.mocked(query).mockImplementation(async (sql, params) => db.query(sql, params) as never);
}, 15_000);
beforeEach(async () => {
  vi.mocked(hasAdminFeatureAccess).mockReset().mockResolvedValue(false);
  vi.mocked(query).mockClear();
  await db.exec(`BEGIN;
    INSERT INTO courses(id,instructor_id,title) VALUES(1,7,'Assigned'),(2,8,'Other');
    INSERT INTO enrollments(student_id,course_id) VALUES(3,1);`);
  await db.query("UPDATE courses SET zoom_link=$1 WHERE id=1", [meeting]);
});
afterEach(async () => { await db.exec("ROLLBACK"); });
afterAll(async () => { await db?.close(); });

describe("course Zoom permissions and persistence", () => {
  it("applies the migration repeatedly without removing saved links", async () => {
    await db.exec(migration);
    expect((await db.query("SELECT zoom_link FROM courses WHERE id=1")).rows).toEqual([{ zoom_link: meeting }]);
  });
  it.each([getCourseZoomLinks, updateCourseZoomLink])("requires an authenticated session", async (handler) => {
    expect((await invoke(handler)).statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
  it("shows a student only enrolled course links and prevents caching", async () => {
    const response = await invoke(getCourseZoomLinks, { user: actor("student", 3) });
    expect(response.body.data).toEqual([{ course_id: 1, zoom_link: meeting }]);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect((await invoke(getCourseZoomLinks, { user: actor("student", 4) })).body.data).toEqual([]);
  });
  it("shows a teacher only their assigned courses", async () => {
    expect((await invoke(getCourseZoomLinks, { user: actor("teacher", 8) })).body.data).toEqual([{ course_id: 2, zoom_link: null }]);
  });
  it("allows the assigned teacher to save, replace and remove a link", async () => {
    const user = actor("teacher", 7);
    const replacement = "https://school.zoom.us/my/class?pwd=replacement";
    expect((await invoke(updateCourseZoomLink, { user, body: { zoom_link: `  ${replacement}  ` } })).body.data.zoom_link).toBe(replacement);
    expect((await invoke(getCourseZoomLinks, { user: actor("student", 3) })).body.data[0].zoom_link).toBe(replacement);
    expect((await invoke(updateCourseZoomLink, { user, body: { zoom_link: "" } })).body.data.zoom_link).toBeNull();
  });
  it.each([actor("student", 3), actor("teacher", 8), actor("admin", 9)])("rejects unauthorized edits by $role", async (user) => {
    expect((await invoke(updateCourseZoomLink, { user })).statusCode).toBe(403);
    expect((await db.query<{ zoom_link: string }>("SELECT zoom_link FROM courses WHERE id=1")).rows[0].zoom_link).toBe(meeting);
  });
  it("lets an administrator with course permission read and update links", async () => {
    vi.mocked(hasAdminFeatureAccess).mockResolvedValue(true);
    const user = actor("admin", 9);
    expect((await invoke(getCourseZoomLinks, { user })).body.data).toHaveLength(2);
    expect((await invoke(updateCourseZoomLink, { user, body: { zoom_link: null } })).statusCode).toBe(200);
    expect(hasAdminFeatureAccess).toHaveBeenCalledWith(9, "courses");
  });
  it("rejects administrators without course permission when reading links", async () => {
    expect((await invoke(getCourseZoomLinks, { user: actor("admin", 9) })).statusCode).toBe(403);
  });
  it("does not update a course reassigned between authorization and saving", async () => {
    vi.mocked(query).mockImplementationOnce(async (sql, params) => {
      const result = await db.query(sql, params);
      await db.exec("UPDATE courses SET instructor_id=8 WHERE id=1");
      return result as never;
    });
    expect((await invoke(updateCourseZoomLink, { user: actor("teacher", 7), body: { zoom_link: null } })).statusCode).toBe(403);
    expect((await db.query<{ zoom_link: string }>("SELECT zoom_link FROM courses WHERE id=1")).rows[0].zoom_link).toBe(meeting);
  });
  it("returns 404 for a missing course", async () => {
    expect((await invoke(updateCourseZoomLink, { user: actor("teacher", 7), params: { id: "99" } })).statusCode).toBe(404);
  });
  it.each(["javascript:alert(1)", "http://zoom.us/j/123", "https://zoom.us.evil.example/j/123", "https://zoom.us@evil.example/j/123", "https://example.com/j/123", "https://user:pass@zoom.us/j/123", undefined, 123])("rejects unsafe or invalid links: %s", async (zoom_link) => {
    expect((await invoke(updateCourseZoomLink, { user: actor("teacher", 7), body: { zoom_link } })).statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
