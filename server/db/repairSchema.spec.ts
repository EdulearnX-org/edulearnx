import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./connection.js", () => ({ default: {}, isDatabaseConfigured: false }));
import { repairSchemaSql } from "./repairSchema.js";

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.waitReady;
}, 15_000);
afterEach(async () => { await db.close(); });

describe("audit repair migration", () => {
  it("keeps production and development SQL identical", () => {
    const migration = readFileSync(new URL("./migrations/20261031_audit_repairs.sql", import.meta.url), "utf8");
    expect(migration.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "").trim()).toBe(repairSchemaSql.trim());
  });

  it("is repeatable and preserves existing prices and course visibility", async () => {
    await db.exec(`CREATE TABLE courses (id UUID PRIMARY KEY, price_cents INTEGER, is_published BOOLEAN);
      INSERT INTO courses VALUES ('960f272b-ee88-4770-8c73-6da567d75f00', 1299, false);`);
    await db.exec(repairSchemaSql);
    await db.exec(repairSchemaSql);
    expect((await db.query("SELECT price_cents, is_published, zoom_link FROM courses")).rows)
      .toEqual([{ price_cents: 1299, is_published: false, zoom_link: null }]);
    expect((await db.query("SELECT version FROM app_migrations")).rows)
      .toEqual([{ version: "20261031_audit_repairs" }]);
    const tables = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    expect(tables.rows.map(row => row.table_name)).toEqual(expect.arrayContaining([
      "upload_intents", "request_limits", "class_schedule_batches",
    ]));
  });
});
