import { RequestHandler } from "express";
import { z } from "zod";
import { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
import { transaction } from "../utils/transaction.js";
import { HttpError, respondError } from "../utils/errors.js";
import { idSchema, phoneSchema } from "../../shared/validation.js";
import { hashPassword, isValidPassword } from "../utils/password.js";

const applicationSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: phoneSchema.optional(),
  expertise: z.string().trim().min(2).max(255),
  experience_years: z.number().int().min(0).max(60),
  certificate_1: z.string().max(7_000_000).optional().or(z.literal("")),
  certificate_2: z.string().max(7_000_000).optional().or(z.literal("")),
  certificate_3: z.string().max(7_000_000).optional().or(z.literal("")),
  bio: z.string().trim().min(20).max(10000),
  password: z.string().refine(isValidPassword, "Use at least 8 characters and at most 72 UTF-8 bytes"),
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

export const reviewTutorApplication: RequestHandler = async (req,res) => {
  try {
    const id=idSchema.parse(req.params.id);
    const status=z.enum(["approved","rejected"]).parse(req.body.status);
    const application=await transaction(async client => {
      const existing=(await client.query("SELECT * FROM tutor_applications WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if (!existing) throw new HttpError(404,"Tutor application not found");
      if (existing.status===status) return {id:existing.id,status};
      if (existing.status!=="pending") throw new HttpError(409,"This application has already been reviewed");
      if (status==="approved") {
        const user=(await client.query("SELECT id,role FROM users WHERE lower(email)=$1 FOR UPDATE",[existing.email.toLowerCase()])).rows[0];
        if (user && user.role!=="teacher") throw new HttpError(409,"This email already belongs to a non-teacher account");
        if (!user) await client.query("INSERT INTO users(email,password_hash,full_name,name,role,phone) VALUES($1,$2,$3,$3,'teacher',$4)",[existing.email,existing.password_hash,existing.full_name,existing.phone]);
      }
      return (await client.query("UPDATE tutor_applications SET status=$1,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$2 WHERE id=$3 RETURNING id,status,reviewed_at,reviewed_by",[status,req.user?.userId,id])).rows[0];
    });
    return sendSuccess(res,application,`Tutor application ${status}`);
  } catch(error) { return respondError(res,error,"Failed to review tutor application"); }
};
