import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "./authTypes.js";
import { sendError } from "./api.js";
import { query } from "../db/connection.js";

declare global {
  namespace Express {
    interface Request { user?: AuthUser; }
  }
}

export function hashAuthToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function readSessionToken(req: Request): string | undefined {
  let token: unknown = req.cookies?.auth_token;
  if (!token) {
    const cookie = req.headers.cookie?.split(";").map((item) => item.trim())
      .find((item) => item.startsWith("auth_token="));
    if (cookie) {
      try { token = decodeURIComponent(cookie.slice("auth_token=".length)); }
      catch { return undefined; }
    }
  }
  // These tokens are opaque 256-bit values, never JWTs or supplied user IDs.
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readSessionToken(req);
  if (!token) return sendError(res, "Authentication required", 401);
  try {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.is_active
       FROM auth_sessions s JOIN users u ON u.id::text = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP
         AND u.is_active IS DISTINCT FROM FALSE`,
      [hashAuthToken(token)],
    );
    const user = result.rows[0];
    if (!user || user.is_active === false) {
      return sendError(res, "Invalid or expired session", 401);
    }
    req.user = { userId: user.id, email: user.email, role: user.role };
    return next();
  } catch {
    return sendError(res, "Unable to verify account", 503);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return sendError(res, "Authentication required", 401);
    if (!roles.includes(req.user.role)) return sendError(res, "Insufficient permissions", 403);
    next();
  };
}
