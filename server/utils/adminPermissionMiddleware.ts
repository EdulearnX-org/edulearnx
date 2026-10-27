import type { RequestHandler } from "express";
import { normalizeAdminPermissions, isPrimaryAdmin, type AdminFeature } from "../../shared/adminPermissions.js";
import { query } from "../db/connection.js";
import { sendError } from "./api.js";

async function getAdminUser(userId: number | string) {
  const result = await query(
    "SELECT email, role, admin_permissions FROM users WHERE id = $1",
    [userId],
  );
  return result.rows[0] as
    | { email: string; role: string; admin_permissions: unknown }
    | undefined;
}

export async function hasAdminFeatureAccess(
  userId: number | string,
  feature: AdminFeature,
) {
  const user = await getAdminUser(userId);
  return Boolean(
    user &&
      user.role === "admin" &&
      (isPrimaryAdmin(user.email) ||
        normalizeAdminPermissions(user.admin_permissions)[feature]),
  );
}

export function requireAdminFeature(...features: AdminFeature[]): RequestHandler {
  return async (req, res, next) => {
    if (!req.user?.userId) {
      return sendError(res, "Authentication required", 401);
    }

    try {
      const user = await getAdminUser(req.user.userId);
      if (!user || user.role !== "admin") {
        return sendError(res, "Admin access required", 403);
      }

      if (features.some((feature) => (
        isPrimaryAdmin(user.email) ||
        normalizeAdminPermissions(user.admin_permissions)[feature]
      ))) {
        return next();
      }

      return sendError(res, "You do not have permission to manage this area", 403);
    } catch (error) {
      console.error("Unable to verify admin permissions:", error);
      return sendError(res, "Unable to verify permissions", 500);
    }
  };
}

export const requireAdminSelfOrUserManagement: RequestHandler = async (
  req,
  res,
  next,
) => {
  // Every authenticated user may access their own safe profile fields. The
  // handler separately restricts account-state changes and admin targets.
  if (req.user?.userId && String(req.user.userId) === String(req.params.id)) {
    return next();
  }

  return requireAdminFeature("users")(req, res, next);
};

export const requirePrimaryAdmin: RequestHandler = async (req, res, next) => {
  if (!req.user?.userId) {
    return sendError(res, "Authentication required", 401);
  }

  try {
    const user = await getAdminUser(req.user.userId);
    if (!user || user.role !== "admin" || !isPrimaryAdmin(user.email)) {
      return sendError(res, "Only the primary admin can manage co-admin access", 403);
    }
    return next();
  } catch (error) {
    console.error("Unable to verify primary admin:", error);
    return sendError(res, "Unable to verify permissions", 500);
  }
};