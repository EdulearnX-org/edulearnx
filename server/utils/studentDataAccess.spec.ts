import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "./authTypes";

vi.mock("../db/connection.js", () => ({
  query: vi.fn(),
}));

vi.mock("./adminPermissionMiddleware.js", () => ({
  hasAdminFeatureAccess: vi.fn(),
}));

import { query } from "../db/connection.js";
import { hasAdminFeatureAccess } from "./adminPermissionMiddleware.js";
import { canAccessCourse, canAccessStudentData } from "./studentDataAccess.js";

const student: AuthUser = { userId: 7, email: "student@example.com", role: "student" };

describe("student data access", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(hasAdminFeatureAccess).mockReset();
  });

  it("allows students to access only their own data and enrolled courses", async () => {
    expect(await canAccessStudentData(student, 7)).toBe(true);
    expect(await canAccessStudentData(student, 8)).toBe(false);

    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    expect(await canAccessStudentData(student, 7, 12)).toBe(true);
    expect(query).toHaveBeenCalledWith(
      "SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2",
      [7, 12],
    );
  });

  it("limits teachers to assigned courses and enrolled students", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 12 }] } as never);
    expect(
      await canAccessStudentData(
        { ...student, userId: 9, role: "teacher" },
        7,
        12,
      ),
    ).toBe(true);

    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
    expect(
      await canAccessStudentData(
        { ...student, userId: 9, role: "teacher" },
        8,
        12,
      ),
    ).toBe(false);
  });

  it("checks the corresponding admin feature before allowing admin access", async () => {
    vi.mocked(hasAdminFeatureAccess).mockResolvedValueOnce(true);
    expect(
      await canAccessStudentData(
        { ...student, userId: 1, role: "admin" },
        7,
        undefined,
        "users",
      ),
    ).toBe(true);
    expect(hasAdminFeatureAccess).toHaveBeenCalledWith(1, "users");
  });

  it("limits un-enrolled student course structure to preview lessons", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
    await expect(canAccessCourse(student, 12)).resolves.toBe("preview");

    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 1 }] } as never);
    await expect(canAccessCourse(student, 12)).resolves.toBe("enrolled");
  });
});
