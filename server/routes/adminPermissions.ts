import type { RequestHandler } from "express";
import {
  adminPermissionsSchema,
  ALL_ADMIN_PERMISSIONS,
  isPrimaryAdmin,
  normalizeAdminPermissions,
  PRIMARY_ADMIN_EMAILS,
} from "../../shared/adminPermissions.js";
import { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";

export const getMyPermissions: RequestHandler = async (req, res) => {
  try {
    const result = await query(
      "SELECT email, role, admin_permissions FROM users WHERE id = $1",
      [req.user?.userId],
    );
    const user = result.rows[0];
    if (!user || user.role !== "admin") {
      return sendError(res, "Admin access required", 403);
    }

    return sendSuccess(res, {
      email: user.email,
      isPrimaryAdmin: isPrimaryAdmin(user.email),
      permissions: isPrimaryAdmin(user.email)
        ? ALL_ADMIN_PERMISSIONS
        : normalizeAdminPermissions(user.admin_permissions),
    });
  } catch (error) {
    console.error("Unable to fetch admin permissions:", error);
    return sendError(res, "Unable to fetch admin permissions", 500);
  }
};

export const getCoAdmins: RequestHandler = async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, admin_permissions
       FROM users
       WHERE role = 'admin' AND NOT (lower(email) = ANY($1::text[]))
       ORDER BY created_at ASC`,
      [[...PRIMARY_ADMIN_EMAILS]],
    );
    return sendSuccess(
      res,
      result.rows.map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        permissions: normalizeAdminPermissions(user.admin_permissions),
      })),
    );
  } catch (error) {
    console.error("Unable to fetch co-admins:", error);
    return sendError(res, "Unable to fetch co-admins", 500);
  }
};

export const updateCoAdminPermissions: RequestHandler = async (req, res) => {
  const parsed = adminPermissionsSchema.safeParse(req.body?.permissions);
  if (!parsed.success) {
    return sendError(res, "Provide a boolean setting for every admin area", 400);
  }

  try {
    const result = await query(
      `UPDATE users
       SET admin_permissions = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND role = 'admin'
         AND NOT (lower(email) = ANY($3::text[]))
       RETURNING id, email, full_name, admin_permissions`,
      [JSON.stringify(parsed.data), req.params.id, [...PRIMARY_ADMIN_EMAILS]],
    );
    const user = result.rows[0];
    if (!user) {
      return sendError(res, "Co-admin not found", 404);
    }

    return sendSuccess(res, {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      permissions: normalizeAdminPermissions(user.admin_permissions),
    }, "Co-admin access updated");
  } catch (error) {
    console.error("Unable to update co-admin permissions:", error);
    return sendError(res, "Unable to update co-admin access", 500);
  }
};