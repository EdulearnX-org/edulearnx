import crypto from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import type { PoolClient } from "pg";
import nodemailer from "nodemailer";
import { z } from "zod";
import pool, { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
import { hashAuthToken, readSessionToken, requireAuth } from "../utils/authMiddleware.js";
import { hashPassword, verifyPassword, isLegacyHash, isValidPassword } from "../utils/password.js";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const passwordSchema = z.string().refine(isValidPassword, "Use at least 8 characters and at most 72 UTF-8 bytes.");
const loginSchema = z.object({email: emailSchema, password: z.string().min(1).max(1024)});
const registerSchema = z.object({email: emailSchema, password: passwordSchema, full_name: z.string().trim().min(1).max(255)});
const resetSchema = z.object({token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: passwordSchema});
const profileColumns = "id, email, full_name, role, profile_image_url, phone, is_active";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;

function publicProfile(user: Record<string, unknown>) {
  const {id,email,full_name,role,profile_image_url,phone,is_active} = user;
  return {id,email,full_name,role,profile_image_url,phone,is_active};
}

function setAuthCookie(res: Response, token: string) {
  res.cookie("auth_token", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api", maxAge: SESSION_MS,
  });
}
function clearAuthCookie(res: Response) {
  res.clearCookie("auth_token", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api",
  });
}
async function createSession(client: PoolClient, userId: unknown) {
  const token = crypto.randomBytes(32).toString("base64url");
  await client.query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashAuthToken(token), String(userId), new Date(Date.now() + SESSION_MS)]);
  return token;
}
async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
class AuthFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}
function fail(res: Response, error: unknown, fallback: string) {
  return sendError(res, error instanceof AuthFailure ? error.message : fallback,
    error instanceof AuthFailure ? error.status : 503);
}

// Best-effort per-instance limiting, scoped by peer IP and account. Shared deployments
// should also configure an edge limiter; never trust arbitrary forwarded-IP headers.
const attempts = new Map<string, {count:number; expires:number}>();
function rateLimit(scope: string, limit: number, duration: number): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    if (attempts.size > 20_000) {
      for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    }
    if (attempts.size > 30_000) return sendError(res, "Too many requests. Try again later.", 429);
    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const keys = [`${scope}:ip:${req.ip || "unknown"}`];
    if (rawEmail) keys.push(`${scope}:email:${hashAuthToken(rawEmail)}`);
    for (const key of keys) {
      let entry = attempts.get(key);
      if (!entry || entry.expires <= now) {
        entry = {count:0, expires:now + duration}; attempts.set(key,entry);
      }
      if (entry.count >= limit) {
        res.setHeader("Retry-After", String(Math.ceil((entry.expires-now)/1000)));
        return sendError(res, "Too many requests. Try again later.", 429);
      }
    }
    keys.forEach((key)=>{ attempts.get(key)!.count += 1; });
    next();
  };
}

export const register: RequestHandler = async (req,res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, "Provide a valid name, email, and password (8 characters minimum; 72 UTF-8 bytes maximum).",400);
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const result = await transaction(async (client) => {
      const created = await client.query(
        `INSERT INTO users (email,password_hash,full_name,name,role)
         VALUES ($1,$2,$3,$3,'student') ON CONFLICT DO NOTHING RETURNING ${profileColumns}`,
        [parsed.data.email,passwordHash,parsed.data.full_name]);
      const user = created.rows[0];
      if (!user) throw new AuthFailure("An account already exists for this email. Sign in or reset its password.",409);
      const token = await createSession(client,user.id);
      return {user,token};
    });
    setAuthCookie(res,result.token);
    return sendSuccess(res,publicProfile(result.user),"Account created",201);
  } catch(error) { return fail(res,error,"Unable to create your account."); }
};

export const login: RequestHandler = async (req,res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res,"Email and password are required.",400);
  try {
    const result = await transaction(async(client)=>{
      const existing = await client.query(`SELECT ${profileColumns}, password_hash FROM users WHERE lower(email)=$1 FOR UPDATE`,[parsed.data.email]);
      const user = existing.rows.length === 1 ? existing.rows[0] : undefined;
      if (!user || user.is_active === false || !(await verifyPassword(parsed.data.password,user.password_hash))) {
        // Avoid a trivial hash-work timing distinction for unknown accounts.
        if (!user) await hashPassword("unknown-account-timing-padding");
        throw new AuthFailure("Invalid email or password.",401);
      }
      if (isLegacyHash(user.password_hash) && Buffer.byteLength(parsed.data.password,"utf8") <= 72) {
        const upgraded = await hashPassword(parsed.data.password);
        await client.query("UPDATE users SET password_hash=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",[upgraded,user.id]);
      }
      const prior = readSessionToken(req);
      if (prior) await client.query("DELETE FROM auth_sessions WHERE token_hash=$1",[hashAuthToken(prior)]);
      return {user,token:await createSession(client,user.id)};
    });
    setAuthCookie(res,result.token);
    return sendSuccess(res,publicProfile(result.user),"Signed in");
  } catch(error) { return fail(res,error,"Unable to sign in."); }
};

export const getSession: RequestHandler = async(req,res)=>{
  try {
    const result = await query(`SELECT ${profileColumns} FROM users WHERE id=$1 AND is_active IS DISTINCT FROM FALSE`,[req.user?.userId]);
    if (!result.rows[0]) { clearAuthCookie(res); return sendError(res,"Invalid or expired session",401); }
    res.setHeader("Cache-Control","no-store");
    return sendSuccess(res,publicProfile(result.rows[0]),"Session loaded");
  } catch { return sendError(res,"Unable to load auth session",503); }
};
export const logout: RequestHandler = async(req,res)=>{
  try {
    const token = readSessionToken(req);
    if (token) await query("DELETE FROM auth_sessions WHERE token_hash=$1",[hashAuthToken(token)]);
    clearAuthCookie(res);
    return sendSuccess(res,null,"Signed out");
  } catch { return sendError(res,"Unable to revoke your session. Please retry.",503); }
};

function mailConfig() {
  const {SMTP_HOST,SMTP_FROM,SMTP_USER,SMTP_PASSWORD,APP_URL} = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!SMTP_HOST || !SMTP_FROM || !APP_URL || !Number.isInteger(port) || port<1 || port>65535 || Boolean(SMTP_USER)!==Boolean(SMTP_PASSWORD)) {
    throw new AuthFailure("Password reset email is not configured. Contact support.",503);
  }
  let app: URL;
  try { app = new URL(APP_URL); } catch { throw new AuthFailure("Password reset email is not configured. Contact support.",503); }
  if (!["https:","http:"].includes(app.protocol) || app.username || app.password || (process.env.NODE_ENV==="production" && app.protocol!=="https:")) {
    throw new AuthFailure("Password reset email is not configured. Contact support.",503);
  }
  const secure = process.env.SMTP_SECURE === "true" || (!process.env.SMTP_SECURE && port===465);
  const transporter = nodemailer.createTransport({host:SMTP_HOST,port,secure,
    // Preserve TLS certificate verification and require STARTTLS for remote SMTP.
    requireTLS: !secure && !["localhost","127.0.0.1","::1"].includes(SMTP_HOST),
    auth: SMTP_USER && SMTP_PASSWORD ? {user:SMTP_USER,pass:SMTP_PASSWORD} : undefined,
    connectionTimeout:10_000, greetingTimeout:10_000, socketTimeout:15_000,
  });
  return {transporter,from:SMTP_FROM,appOrigin:app.origin};
}
export const forgotPassword: RequestHandler = async(req,res)=>{
  const parsed = emailSchema.safeParse(req.body?.email);
  if (!parsed.success) return sendError(res,"Provide a valid email address.",400);
  let issuedHash: string | undefined;
  try {
    const mail = mailConfig();
    const result = await transaction(async(client)=>{
      const existing = await client.query("SELECT id FROM users WHERE lower(email)=$1 AND is_active IS DISTINCT FROM FALSE FOR UPDATE",[parsed.data]);
      if (existing.rows.length!==1) return null;
      const token=crypto.randomBytes(32).toString("base64url");
      issuedHash=hashAuthToken(token);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1",[String(existing.rows[0].id)]);
      await client.query("INSERT INTO password_reset_tokens (token_hash,user_id,expires_at,created_by) VALUES ($1,$2,$3,$4)",[issuedHash,String(existing.rows[0].id),new Date(Date.now()+RESET_MS),String(existing.rows[0].id)]);
      return token;
    });
    if (result) await mail.transporter.sendMail({from:mail.from,to:parsed.data,subject:"Reset your EduLearnX password",
      text:`Use this link to reset your EduLearnX password within 30 minutes:\n\n${mail.appOrigin}/reset-password?token=${encodeURIComponent(result)}\n\nIf you did not request this, you can ignore this email.`,
    });
    return sendSuccess(res,null,"If an active account exists, a password reset email has been sent.");
  } catch(error) {
    if (issuedHash) { try { await query("DELETE FROM password_reset_tokens WHERE token_hash=$1",[issuedHash]); } catch { /* Token still expires after 30 minutes. */ } }
    return fail(res,error,"Unable to send password reset email. Please try again later.");
  }
};
export const resetPassword: RequestHandler = async(req,res)=>{
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res,"Provide a valid reset token and a password of 8 characters minimum (72 UTF-8 bytes maximum).",400);
  try {
    const passwordHash=await hashPassword(parsed.data.password);
    await transaction(async(client)=>{
      const found=await client.query(
        `SELECT u.id FROM password_reset_tokens t JOIN users u ON u.id::text=t.user_id
         WHERE t.token_hash=$1 AND t.expires_at>CURRENT_TIMESTAMP AND u.is_active IS DISTINCT FROM FALSE FOR UPDATE OF u,t`,
        [hashAuthToken(parsed.data.token)]);
      if (!found.rows[0]) throw new AuthFailure("Reset link is invalid or expired. Request a new one.",400);
      const userId=found.rows[0].id;
      await client.query("UPDATE users SET password_hash=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",[passwordHash,userId]);
      await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[String(userId)]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1",[String(userId)]);
    });
    clearAuthCookie(res);
    return sendSuccess(res,null,"Password reset. Sign in with your new password.");
  } catch(error) { return fail(res,error,"Unable to reset your password."); }
};
export const changePassword: RequestHandler = async(req,res)=>{
  const parsed=z.object({current_password:z.string().min(1).max(1024),password:passwordSchema}).safeParse(req.body);
  if (!parsed.success) return sendError(res,"Provide your current password and a new password of 8 characters minimum (72 UTF-8 bytes maximum).",400);
  try {
    const result=await transaction(async(client)=>{
      const found=await client.query(`SELECT ${profileColumns},password_hash FROM users WHERE id=$1 AND is_active IS DISTINCT FROM FALSE FOR UPDATE`,[req.user?.userId]);
      const user=found.rows[0];
      if (!user || !(await verifyPassword(parsed.data.current_password,user.password_hash))) throw new AuthFailure("Current password is incorrect.",401);
      await client.query("UPDATE users SET password_hash=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",[await hashPassword(parsed.data.password),user.id]);
      await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[String(user.id)]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1",[String(user.id)]);
      return {user,token:await createSession(client,user.id)};
    });
    setAuthCookie(res,result.token);
    return sendSuccess(res,publicProfile(result.user),"Password changed. Other sessions have been signed out.");
  } catch(error) { return fail(res,error,"Unable to change your password."); }
};

export const authRouter=Router();
authRouter.use((req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  if (req.method!=="GET" && req.method!=="HEAD") {
    const origin=req.headers.origin;
    if (origin) {
      try {
        const parsed=new URL(origin);
        const configured=process.env.APP_URL ? new URL(process.env.APP_URL).origin : undefined;
        if (parsed.host!==req.get("host") && parsed.origin!==configured) return sendError(res,"Request origin is not allowed.",403);
      } catch { return sendError(res,"Request origin is not allowed.",403); }
    }
    if (req.path!=="/logout" && !req.is("application/json")) return sendError(res,"Use application/json for authentication requests.",415);
  }
  next();
});
authRouter.post("/register",rateLimit("register",10,60*60*1000),register);
authRouter.post("/login",rateLimit("login",20,15*60*1000),login);
authRouter.get("/session",requireAuth,getSession);
authRouter.post("/logout",logout);
authRouter.post("/forgot-password",rateLimit("forgot-password",5,60*60*1000),forgotPassword);
authRouter.post("/reset-password",rateLimit("reset-password",20,15*60*1000),resetPassword);
authRouter.post("/change-password",rateLimit("change-password",20,15*60*1000),requireAuth,changePassword);
