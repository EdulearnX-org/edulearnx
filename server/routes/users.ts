import { RequestHandler } from "express";
import crypto from "node:crypto";
import { query } from "../db/connection.js";
import { hashPassword } from "../utils/password.js";
import { z } from "zod";
import { isPrimaryAdmin } from "../../shared/adminPermissions.js";
import { sendError } from "../utils/api.js";

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  profile_image_url: z.union([z.literal(""), z.string().url().max(2048).refine((url) => /^https?:/.test(url))]).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();

async function mayManageTarget(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  const target = await query("SELECT id, email, role FROM users WHERE id=$1", [req.params.id]);
  if (!target.rows[0]) { sendError(res, "User not found", 404); return false; }
  const self = String(req.user?.userId) === String(req.params.id);
  if (target.rows[0].role === "admin" && !self && !isPrimaryAdmin(req.user?.email || "")) {
    sendError(res, "Only the primary admin can manage other admins", 403); return false;
  }
  return true;
}

export const getUsers: RequestHandler = async (req, res) => {
  try {
    const result = await query(
      "SELECT id, email, full_name, role, profile_image_url, phone, is_active, created_at, updated_at FROM users ORDER BY created_at DESC"
    );
    res.json({
      success: true,
      data: result.rows,
      message: "Users fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
    });
  }
};

export const getUserById: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "SELECT id, email, full_name, role, profile_image_url, phone, is_active, created_at, updated_at FROM users WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "User fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
};

export const createUser: RequestHandler = async (req, res) => {
  try {
    const parsed = z.object({
      email: z.string().trim().toLowerCase().email().max(255),
      full_name: z.string().trim().min(1).max(255),
      role: z.enum(["admin", "teacher", "student"]),
      phone: z.string().trim().max(50).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return sendError(res, "Provide a valid email, full name, and role", 400);
    const { email: normalizedEmail, full_name, role, phone } = parsed.data;

    if (role === "admin" && !isPrimaryAdmin(req.user?.email || "")) {
      return sendError(res, "Only the primary admin can create admins", 403);
    }

    const unusablePasswordHash = await hashPassword(
      crypto.randomBytes(32).toString("base64url"),
    );
    const result = await query(
      "INSERT INTO users (email, password_hash, full_name, name, role, phone) VALUES ($1, $2, $3, $3, $4, $5) RETURNING id, email, full_name, role, phone, is_active, created_at, updated_at",
      [normalizedEmail, unusablePasswordHash, full_name, role, phone || null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "User created successfully",
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    if (error.code === "23505") {
      // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to create user",
    });
  }
};

export const updateUser: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, "Provide valid profile fields; role, email, and credentials cannot be changed here", 400);
    const self = String(req.user?.userId) === String(id);
    if (self && parsed.data.is_active !== undefined) {
      return sendError(res, "Account activation cannot be changed through self-profile editing", 403);
    }
    if (!(await mayManageTarget(req, res))) return;
    const { full_name, phone, profile_image_url, is_active } = parsed.data;
    const result = await query(
      `UPDATE users SET full_name=COALESCE($1,full_name), name=COALESCE($1,name),
       phone=CASE WHEN $2 THEN $3 ELSE phone END,
       profile_image_url=CASE WHEN $4 THEN $5 ELSE profile_image_url END,
       is_active=COALESCE($6,is_active),updated_at=CURRENT_TIMESTAMP
       WHERE id=$7 RETURNING id,email,full_name,role,profile_image_url,phone,is_active,created_at,updated_at`,
      [full_name || null, "phone" in parsed.data, phone || null,
       "profile_image_url" in parsed.data, profile_image_url || null, is_active ?? null, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: "User updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating user:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }
    res.status(500).json({
      success: false,
      error: "Failed to update user",
    });
  }
};

export const deleteUser: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (!(await mayManageTarget(req, res))) return;
    const target = await query("SELECT email FROM users WHERE id=$1", [id]);
    if (isPrimaryAdmin(target.rows[0]?.email || "") || String(req.user?.userId) === String(id)) {
      return sendError(res, "Primary admin accounts and your own account cannot be deleted here", 403);
    }

    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete user",
    });
  }
};
