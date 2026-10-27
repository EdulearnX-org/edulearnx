import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../db/connection.js", () => ({ query: vi.fn() }));
vi.mock("./enrollmentRequests.js", () => ({ getPendingEnrollmentRequestCount: vi.fn() }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

async function loadStats(configured: boolean) {
  vi.stubEnv("SUPABASE_URL", configured ? "https://project.example.com" : "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", configured ? "test-key" : "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const { query } = await import("../db/connection.js");
  const { getPendingEnrollmentRequestCount } = await import("./enrollmentRequests.js");
  vi.mocked(query).mockResolvedValue({ rows: [{ total_students: 4, total_teachers: 2, total_courses: 3, total_enrollments: 6 }] } as never);
  vi.mocked(getPendingEnrollmentRequestCount).mockResolvedValue(7);
  const { getPlatformStats } = await import("./stats.js");
  const response = { json: vi.fn() };
  await getPlatformStats({} as Request, response as unknown as Response, vi.fn());
  return { payload: response.json.mock.calls[0][0], getPendingEnrollmentRequestCount };
}

it("uses the enrollment application's store for pending counts", async () => {
  const { payload, getPendingEnrollmentRequestCount } = await loadStats(true);
  expect(payload.data).toMatchObject({ totalStudents: 4, pendingEnrollmentRequests: 7 });
  expect(getPendingEnrollmentRequestCount).toHaveBeenCalledOnce();
});

it("keeps Neon statistics available when optional Supabase enrollment storage is unconfigured", async () => {
  const { payload, getPendingEnrollmentRequestCount } = await loadStats(false);
  expect(payload.data).toMatchObject({ totalEnrollments: 6, pendingEnrollmentRequests: 0 });
  expect(getPendingEnrollmentRequestCount).not.toHaveBeenCalled();
});
