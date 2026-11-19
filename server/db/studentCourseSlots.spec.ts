import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE courses (id INTEGER PRIMARY KEY);
    CREATE TABLE enrollments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      UNIQUE(student_id, course_id)
    );
    CREATE TABLE app_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users VALUES (1), (2);
    INSERT INTO courses VALUES (10), (20);
    INSERT INTO enrollments (student_id, course_id) VALUES
      (1, 10), (1, 20), (2, 10);
  `);

  const migration = readFileSync(
    new URL("./migrations/20261116_student_course_slots.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
}, 15_000);

afterEach(async () => {
  await db.close();
});

describe("student course slot schema", () => {
  it("allows the same time for different students but not two courses for one student", async () => {
    await db.exec(`
      BEGIN;
      UPDATE enrollments SET class_time_slot='08:00'
        WHERE student_id=1 AND course_id=10;
      UPDATE enrollments SET class_time_slot='08:00'
        WHERE student_id=2 AND course_id=10;
      SAVEPOINT duplicate_slot;
    `);

    await expect(
      db.query(
        "UPDATE enrollments SET class_time_slot='08:00' WHERE student_id=1 AND course_id=20",
      ),
    ).rejects.toMatchObject({ code: "23505" });

    await db.exec("ROLLBACK TO SAVEPOINT duplicate_slot");
    expect((await db.query(
      "SELECT class_time_slot FROM enrollments WHERE student_id=1 AND course_id=20",
    )).rows[0]).toEqual({ class_time_slot: null });
    await db.exec("COMMIT");
  });

  it("accepts only the five configured start times", async () => {
    await expect(
      db.query(
        "UPDATE enrollments SET class_time_slot='09:00' WHERE student_id=1 AND course_id=10",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
