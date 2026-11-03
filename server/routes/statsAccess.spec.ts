import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../env.js", () => ({}));
vi.mock("../db/connection.js", () => ({
  default: {},
  query: vi.fn(),
  isDatabaseConfigured: true,
}));

import { query } from "../db/connection.js";
import { createServer } from "../index.js";

const counts = { total_students: 4, total_teachers: 2, total_courses: 3, total_enrollments: 6 };
const cookie = `auth_token=${Buffer.alloc(32, 7).toString("base64url")}`;
let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubEnv("CORS_ORIGIN", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  await new Promise<void>((resolve, reject) => {
    server = createServer().listen(0, "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

beforeEach(() => {
  vi.mocked(query).mockReset().mockResolvedValue({ rows: [counts] } as never);
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  vi.unstubAllEnvs();
});

function signedInAs(role: string, overview: boolean) {
  vi.mocked(query).mockImplementation(async (sql) => {
    if (sql.includes("FROM auth_sessions")) {
      return { rows: [{ id: 1, email: "member@example.com", role, is_active: true }] } as never;
    }
    if (sql.includes("SELECT email, role, admin_permissions")) {
      return { rows: [{ email: "member@example.com", role, admin_permissions: { overview } }] } as never;
    }
    return { rows: [counts] } as never;
  });
}

describe("statistics access boundaries", () => {
  it("serves only homepage totals without a session", async () => {
    const response = await fetch(`${base}/public-stats`);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ totalStudents: 4, totalCourses: 3, totalEnrollments: 6 });
    expect(query).toHaveBeenCalledOnce();
  });

  it("requires a session for administrative statistics", async () => {
    const response = await fetch(`${base}/platform-stats`);
    expect(response.status).toBe(401);
    expect((await response.json()).success).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["student", "teacher", "admin"])("rejects a %s without overview permission", async (role) => {
    signedInAs(role, false);
    const response = await fetch(`${base}/platform-stats`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(403);
    expect((await response.json()).success).toBe(false);
    expect(vi.mocked(query).mock.calls.some(([sql]) => sql.includes("COUNT(*)"))).toBe(false);
  });

  it("retains administrative statistics for an authorized admin", async () => {
    signedInAs("admin", true);
    const response = await fetch(`${base}/platform-stats`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ totalTeachers: 2, pendingEnrollmentRequests: 0, revenue: 0 });
  });
});
