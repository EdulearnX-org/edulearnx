import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../db/connection.js", () => ({
  default: {},
  query: vi.fn(),
}));
vi.mock("../utils/transaction.js", () => ({ transaction: vi.fn() }));
vi.mock("../utils/adminPermissionMiddleware.js", () => ({
  hasAdminFeatureAccess: vi.fn(),
}));

import { transaction } from "../utils/transaction.js";
import { updateEnrollmentTimeSlot } from "./courses.js";

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    set() { return this; },
  };
}

async function invoke(body: unknown, user = { userId: 101, email: "student@example.com", role: "student" }) {
  const res = response();
  await updateEnrollmentTimeSlot({
    params: { id: "301" },
    body,
    user,
  } as unknown as Request, res as unknown as Response, vi.fn());
  return res;
}

describe("student course time slots", () => {
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(transaction).mockImplementation(async work => work(client as never));
  });

  it("books one of the fixed slots for the student's own enrollment", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 301 }] })
      .mockResolvedValueOnce({ rows: [{ id: 301, student_id: 101, course_id: 201, class_time_slot: null, course_title: "Python" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 301, student_id: 101, course_id: 201, class_time_slot: "14:00" }] });

    const res = await invoke({ class_time_slot: "14:00" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.class_time_slot).toBe("14:00");
    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE enrollments"),
      ["14:00", "301", 101],
    );
  });

  it("allows a student to change an already-booked slot", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 301 }] })
      .mockResolvedValueOnce({ rows: [{ id: 301, student_id: 101, course_id: 201, class_time_slot: "08:00", course_title: "Python" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 301, student_id: 101, course_id: 201, class_time_slot: "14:00" }] });

    const res = await invoke({ class_time_slot: "14:00" });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.class_time_slot).toBe("14:00");
    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE enrollments"),
      ["14:00", "301", 101],
    );
  });

  it("rejects a slot that the student already uses for another course", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 301 }, { id: 302 }] })
      .mockResolvedValueOnce({ rows: [{ id: 301, student_id: 101, course_id: 201, class_time_slot: null, course_title: "Python" }] })
      .mockResolvedValueOnce({ rows: [{ course_title: "English" }] });

    const res = await invoke({ class_time_slot: "08:00" });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain("already booked for English");
  });

  it("rejects unknown times and non-student accounts", async () => {
    const invalidSlot = await invoke({ class_time_slot: "09:00" });
    expect(invalidSlot.statusCode).toBe(400);

    const teacher = await invoke(
      { class_time_slot: "08:00" },
      { userId: 102, email: "teacher@example.com", role: "teacher" },
    );
    expect(teacher.statusCode).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
});
