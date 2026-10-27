import { RequestHandler } from "express";
import { z } from "zod";
import { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
import { hashPassword } from "../utils/password.js";

const applicationSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(5).optional().or(z.literal("")),
  expertise: z.string().min(2),
  experience_years: z.coerce.number().min(0).max(60),
  certificate_1: z.string().max(7_000_000).optional().or(z.literal("")),
  certificate_2: z.string().max(7_000_000).optional().or(z.literal("")),
  certificate_3: z.string().max(7_000_000).optional().or(z.literal("")),
  bio: z.string().min(20),
  password: z.string().min(8),
});

const applicationSelect = `
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

export const getTutorApplications: RequestHandler = async (req, res) => {
  try {
    const { status } = req.query;
    const params: unknown[] = [];
    let sql = applicationSelect;

    if (status) {
      params.push(String(status));
      sql += " WHERE status = $1";
    }

    sql += " ORDER BY requested_at DESC";

    const result = await query(sql, params);
    return sendSuccess(res, result.rows, "Tutor applications fetched successfully");
  } catch (error) {
    console.error("Error fetching tutor applications:", error);
    return sendError(res, "Failed to fetch tutor applications", 500);
  }
};

export const createTutorApplication: RequestHandler = async (req, res) => {
  const parsed = applicationSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(res, parsed.error.flatten().formErrors.join("; "), 400);
  }

  const {
    full_name,
    email,
    phone,
    expertise,
    experience_years,
    certificate_1,
    certificate_2,
    certificate_3,
    bio,
    password,
  } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingPending = await query(
      "SELECT id FROM tutor_applications WHERE lower(email) = $1 AND status = 'pending'",
      [normalizedEmail],
    );

    if (existingPending.rows.length > 0) {
      return sendError(res, "A pending tutor application already exists for this email", 409);
    }

    const created = await query(
      `INSERT INTO tutor_applications (
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
      RETURNING id, full_name, email, phone, expertise, experience_years, certificate_1, certificate_2, certificate_3, bio, status, requested_at, reviewed_at, reviewed_by`,
      [
        full_name.trim(),
        normalizedEmail,
        phone?.trim() || null,
        expertise.trim(),
        experience_years,
        certificate_1 || null,
        certificate_2 || null,
        certificate_3 || null,
        bio.trim(),
        await hashPassword(password),
      ],
    );

    return sendSuccess(res, created.rows[0], "Tutor application submitted for review", 201);
  } catch (error) {
    console.error("Error creating tutor application:", error);
    return sendError(res, "Failed to submit tutor application", 500);
  }
};

export const reviewTutorApplication: RequestHandler = async (req, res) => {
  try {
    const applicationId = Number(req.params.id);
    const status = String(req.body.status || "");
    const reviewedBy = req.user?.userId ?? null;

    if (!applicationId || !["approved", "rejected"].includes(status)) {
      return sendError(res, "Valid application id and status are required", 400);
    }

    const existing = await query(
      "SELECT * FROM tutor_applications WHERE id = $1",
      [applicationId],
    );

    if (existing.rows.length === 0) {
      return sendError(res, "Tutor application not found", 404);
    }

    const application = existing.rows[0];

    if (application.status !== "pending") {
      return sendError(res, "This tutor application has already been reviewed", 409);
    }

    if (status === "approved") {
      const existingUser = await query(
        "SELECT id, role FROM users WHERE lower(email) = $1",
        [application.email],
      );

      if (existingUser.rows.length > 0 && existingUser.rows[0].role !== "teacher") {
        return sendError(
          res,
          "This email already belongs to a non-teacher account",
          409,
        );
      }

      if (existingUser.rows.length === 0) {
        await query(
          "INSERT INTO users (email, password_hash, full_name, role, phone) VALUES ($1, $2, $3, 'teacher', $4)",
          [
            application.email,
            application.password_hash,
            application.full_name,
            application.phone,
          ],
        );
      }
    }

    const updated = await query(
      "UPDATE tutor_applications SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2 WHERE id = $3 RETURNING id, full_name, email, phone, expertise, experience_years, certificate_1, certificate_2, certificate_3, bio, status, requested_at, reviewed_at, reviewed_by",
      [status, reviewedBy, applicationId],
    );

    return sendSuccess(res, updated.rows[0], `Tutor application ${status}`);
  } catch (error) {
    console.error("Error reviewing tutor application:", error);
    return sendError(res, "Failed to review tutor application", 500);
  }
};
