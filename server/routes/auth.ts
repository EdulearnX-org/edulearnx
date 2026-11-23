import crypto from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import type { PoolClient } from "pg";
import nodemailer from "nodemailer";
import { rateLimit as expressRateLimit } from "express-rate-limit";
import { z } from "zod";
import pool, { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
import { hashAuthToken, readSessionToken, requireAuth } from "../utils/authMiddleware.js";
import { hashPassword, verifyPassword, isLegacyHash, isValidPassword } from "../utils/password.js";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpUri, verifyTotp } from "../utils/totp.js";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const passwordSchema = z.string().refine(isValidPassword, "Use at least 8 characters and at most 72 UTF-8 bytes.");
const loginSchema = z.object({email: emailSchema, password: z.string().min(1).max(1024)});
const registerSchema = z.object({email: emailSchema, password: passwordSchema, full_name: z.string().trim().min(1).max(255)});
const resetSchema = z.object({token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: passwordSchema});
const profileColumns = "id, email, full_name, role, profile_image_url, phone, is_active, two_factor_enabled, two_factor_required_at";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;
const twoFactorStatusLimiter = expressRateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (req) => `user:${req.user?.userId ?? "unknown"}` });
const twoFactorSetupLimiter = expressRateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (req) => `user:${req.user?.userId ?? "unknown"}` });
const twoFactorConfirmLimiter = expressRateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (req) => `user:${req.user?.userId ?? "unknown"}` });
const twoFactorDeferLimiter = expressRateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (req) => `user:${req.user?.userId ?? "unknown"}` });
const twoFactorLoginVerifyLimiter = expressRateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (req) => `challenge:${crypto.createHash("sha256").update(String(req.body?.challenge_token ?? "missing")).digest("hex")}` });

function publicProfile(user: Record<string, unknown>) {
  const {id,email,full_name,role,profile_image_url,phone,is_active} = user;
  return {id,email,full_name,role,profile_image_url,phone,is_active,two_factor_enabled:role === "student" ? false : Boolean(user.two_factor_enabled),two_factor_required_at:role === "student" ? null : (user.two_factor_required_at ?? null)};
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
  let pendingHash: string | undefined;
  try {
    const mail = mailConfig();
    const passwordHash = await hashPassword(parsed.data.password);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge = crypto.randomBytes(32).toString("base64url");
    pendingHash = hashAuthToken(challenge);
    await transaction(async (client) => {
      const existing = await client.query("SELECT id FROM users WHERE lower(email)=$1", [parsed.data.email]);
      if (existing.rows.length) throw new AuthFailure("An account already exists for this email. Sign in or reset its password.",409);
      await client.query("DELETE FROM pending_student_registrations WHERE email=$1 OR expires_at<=CURRENT_TIMESTAMP", [parsed.data.email]);
      await client.query(
        "INSERT INTO pending_student_registrations(token_hash,email,password_hash,full_name,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [pendingHash,parsed.data.email,passwordHash,parsed.data.full_name,hashAuthToken(challenge+":"+code),new Date(Date.now()+10*60*1000)]);
    });
    try {
      await mail.transporter.sendMail({from:mail.from,to:parsed.data.email,subject:"Verify your EduLearnX email",
        text:`Your EduLearnX verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`});
    } catch (error) {
      await query("DELETE FROM pending_student_registrations WHERE token_hash=$1",[pendingHash]);
      throw error;
    }
    return sendSuccess(res,{email_verification_required:true,challenge_token:challenge,email:parsed.data.email},"A verification code has been sent to your email.",202);
  } catch(error) {
    if (pendingHash) { try { await query("DELETE FROM pending_student_registrations WHERE token_hash=$1",[pendingHash]); } catch { /* Expiring pending registration is harmless. */ } }
    return fail(res,error,"Unable to start your registration. Please try again.");
  }
};

export const verifyRegistrationEmailOtp: RequestHandler = async(req,res) => {
  const parsed=z.object({challenge_token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().regex(/^\\d{6}$/)}).safeParse(req.body);
  if(!parsed.success)return sendError(res,"Enter the six-digit code sent to your email.",400);
  try {
    const result=await transaction(async(client)=>{
      const hash=hashAuthToken(parsed.data.challenge_token);
      const found=await client.query("SELECT * FROM pending_student_registrations WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP FOR UPDATE",[hash]);
      const pending=found.rows[0];
      if(!pending)throw new AuthFailure("Verification code expired. Please register again.",400);
      if(Number(pending.attempts)>=5){await client.query("DELETE FROM pending_student_registrations WHERE token_hash=$1",[hash]);throw new AuthFailure("Too many incorrect codes. Please register again.",429);}
      await client.query("UPDATE pending_student_registrations SET attempts=attempts+1 WHERE token_hash=$1",[hash]);
      const actual=hashAuthToken(parsed.data.challenge_token+":"+parsed.data.code);
      if(actual!==pending.code_hash)throw new AuthFailure("That verification code is incorrect.",401);
      const created=await client.query(
        `INSERT INTO users(email,password_hash,full_name,name,role,email_verified_at)
         VALUES($1,$2,$3,$3,'student',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING ${profileColumns}`,
        [pending.email,pending.password_hash,pending.full_name]);
      if(!created.rows[0])throw new AuthFailure("An account already exists for this email. Sign in instead.",409);
      await client.query("DELETE FROM pending_student_registrations WHERE token_hash=$1",[hash]);
      return {user:created.rows[0],token:await createSession(client,created.rows[0].id)};
    });
    setAuthCookie(res,result.token);
    return sendSuccess(res,publicProfile(result.user),"Email verified. Your account is ready.",201);
  } catch(error){return fail(res,error,"Unable to verify your email.");}
};

export const login: RequestHandler = async (req,res) => {
 const parsed=loginSchema.safeParse(req.body); if(!parsed.success)return sendError(res,"Email and password are required.",400);
 try{
  const result=await transaction(async(client)=>{
   const found=await client.query(`SELECT ${profileColumns},password_hash,two_factor_enabled,two_factor_secret_enc,two_factor_required_at FROM users WHERE lower(email)=$1 FOR UPDATE`,[parsed.data.email]);
   const user=found.rows[0];
   if(!user||user.is_active===false||!(await verifyPassword(parsed.data.password,user.password_hash))){if(!user)await hashPassword("unknown-account-timing-padding");throw new AuthFailure("Invalid email or password.",401);}
   if(isLegacyHash(user.password_hash)&&Buffer.byteLength(parsed.data.password,"utf8")<=72)await client.query("UPDATE users SET password_hash=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",[await hashPassword(parsed.data.password),user.id]);
   const prior=readSessionToken(req);if(prior)await client.query("DELETE FROM auth_sessions WHERE token_hash=$1",[hashAuthToken(prior)]);
   if(user.role==="student"){
    const challenge=crypto.randomBytes(32).toString("base64url");
    const code=String(crypto.randomInt(0,1_000_000)).padStart(6,"0");
    await client.query("DELETE FROM email_otp_challenges WHERE expires_at<=CURRENT_TIMESTAMP");
    await client.query("INSERT INTO email_otp_challenges(token_hash,user_id,code_hash,purpose,expires_at) VALUES($1,$2,$3,'login',$4)",
      [hashAuthToken(challenge),String(user.id),hashAuthToken(challenge+":"+code),new Date(Date.now()+5*60*1000)]);
    return {emailOtp:true,challenge,code,email:user.email};
   }
   if(user.two_factor_enabled){
    const challenge=crypto.randomBytes(32).toString("base64url");
    await client.query("DELETE FROM two_factor_login_challenges WHERE expires_at<=CURRENT_TIMESTAMP");
    await client.query("INSERT INTO two_factor_login_challenges(token_hash,user_id,expires_at) VALUES($1,$2,$3)",[hashAuthToken(challenge),String(user.id),new Date(Date.now()+5*60*1000)]);
    return {twoFactor:true,challenge};
   }
   return {twoFactor:false,emailOtp:false,user,token:await createSession(client,user.id)};
  });
  if("emailOtp" in result && result.emailOtp){
    try {
      const mail=mailConfig();
      await mail.transporter.sendMail({from:mail.from,to:result.email,subject:"Your EduLearnX sign-in code",
        text:`Your EduLearnX sign-in code is ${result.code}. It expires in 5 minutes. If you did not try to sign in, change your password.`});
    } catch(error) {
      await query("DELETE FROM email_otp_challenges WHERE token_hash=$1",[hashAuthToken(result.challenge)]);
      throw error;
    }
    return sendSuccess(res,{email_otp_required:true,challenge_token:result.challenge,email:result.email},"A sign-in code has been sent to your email.");
  }
  if(result.twoFactor)return sendSuccess(res,{two_factor_required:true,challenge_token:result.challenge},"Authenticator verification required");
  setAuthCookie(res,result.token!);return sendSuccess(res,publicProfile(result.user),"Signed in");
 }catch(error){return fail(res,error,"Unable to sign in.");}
};

export const verifyLoginEmailOtp: RequestHandler=async(req,res)=>{
 const parsed=z.object({challenge_token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().regex(/^\\d{6}$/)}).safeParse(req.body);
 if(!parsed.success)return sendError(res,"Enter the six-digit code sent to your email.",400);
 try{
  const result=await transaction(async(client)=>{
   const hash=hashAuthToken(parsed.data.challenge_token);
   const found=await client.query(`SELECT c.user_id,c.code_hash,c.attempts,u.role,u.is_active FROM email_otp_challenges c JOIN users u ON u.id::text=c.user_id WHERE c.token_hash=$1 AND c.purpose='login' AND c.expires_at>CURRENT_TIMESTAMP FOR UPDATE OF c,u`,[hash]);
   const row=found.rows[0];if(!row||row.is_active===false||row.role!=="student")throw new AuthFailure("This sign-in code expired. Sign in again.",401);
   if(Number(row.attempts)>=5){await client.query("DELETE FROM email_otp_challenges WHERE token_hash=$1",[hash]);throw new AuthFailure("Too many incorrect codes. Sign in again.",429);}
   await client.query("UPDATE email_otp_challenges SET attempts=attempts+1 WHERE token_hash=$1",[hash]);
   if(hashAuthToken(parsed.data.challenge_token+":"+parsed.data.code)!==row.code_hash)return {invalid:true};
   await client.query("DELETE FROM email_otp_challenges WHERE token_hash=$1",[hash]);
   await client.query("UPDATE users SET email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP) WHERE id=$1",[row.user_id]);
   return {userId:row.user_id,token:await createSession(client,row.user_id)};
  });
  if("invalid" in result)return sendError(res,"That code is incorrect. Try again.",401);
  setAuthCookie(res,result.token);
  const profile=await query(`SELECT ${profileColumns} FROM users WHERE id=$1`,[result.userId]);
  return sendSuccess(res,publicProfile(profile.rows[0]),"Email verified. Signed in.");
 }catch(error){return fail(res,error,"Unable to verify your sign-in code.");}
};

export const verifyLoginTotp: RequestHandler=async(req,res)=>{
 const parsed=z.object({challenge_token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().regex(/^\d{6}$/)}).safeParse(req.body);
 if(!parsed.success)return sendError(res,"Enter the six-digit authenticator code.",400);
 try{
  const result=await transaction(async(client)=>{
   const found=await client.query(`SELECT c.user_id,c.attempts,u.two_factor_secret_enc,u.is_active FROM two_factor_login_challenges c JOIN users u ON u.id::text=c.user_id WHERE c.token_hash=$1 AND c.expires_at>CURRENT_TIMESTAMP FOR UPDATE OF c,u`,[hashAuthToken(parsed.data.challenge_token)]);
   const row=found.rows[0];if(!row||row.is_active===false)throw new AuthFailure("Verification expired. Sign in again.",401);
   if(Number(row.attempts)>=5){await client.query("DELETE FROM two_factor_login_challenges WHERE token_hash=$1",[hashAuthToken(parsed.data.challenge_token)]);return {tooMany:true};}
   await client.query("UPDATE two_factor_login_challenges SET attempts=attempts+1 WHERE token_hash=$1",[hashAuthToken(parsed.data.challenge_token)]);
   let valid=false;try{valid=verifyTotp(decryptTotpSecret(row.two_factor_secret_enc),parsed.data.code);}catch{throw new AuthFailure("Authenticator verification is temporarily unavailable.",503);}
   if(!valid)return {invalid:true};
   await client.query("DELETE FROM two_factor_login_challenges WHERE token_hash=$1",[hashAuthToken(parsed.data.challenge_token)]);
   await client.query("UPDATE users SET two_factor_last_verified_at=CURRENT_TIMESTAMP WHERE id=$1",[row.user_id]);
   return {userId:row.user_id,token:await createSession(client,row.user_id)};
  });
  if ("tooMany" in result) return sendError(res,"Too many incorrect codes. Sign in again.",429);
  if ("invalid" in result) return sendError(res,"That code is incorrect. Check your authenticator app and try again.",401);
  setAuthCookie(res,result.token);
  const profile=await query(`SELECT ${profileColumns},two_factor_enabled,two_factor_required_at FROM users WHERE id=$1`,[result.userId]);
  return sendSuccess(res,publicProfile(profile.rows[0]),"Signed in");
 }catch(error){return fail(res,error,"Unable to verify authenticator code.");}
};

export const getTwoFactorStatus: RequestHandler=async(req,res)=>{\n if(req.user?.role==="student")return sendError(res,"Authenticator-app two-factor authentication is not used for student accounts. Student sign-ins use email OTP.",403);
 try{const r=await query("SELECT two_factor_enabled,two_factor_required_at,two_factor_defer_used FROM users WHERE id=$1",[req.user?.userId]);if(!r.rows[0])return sendError(res,"Account not found.",404);return sendSuccess(res,{enabled:Boolean(r.rows[0].two_factor_enabled),required_at:r.rows[0].two_factor_required_at,defer_used:Boolean(r.rows[0].two_factor_defer_used)},"Two-factor status");}
 catch{return sendError(res,"Unable to load two-factor status.",503);}
};
export const beginTwoFactorSetup: RequestHandler=async(req,res)=>{\n if(req.user?.role==="student")return sendError(res,"Authenticator-app two-factor authentication is not used for student accounts. Student sign-ins use email OTP.",403);
 try{
  const r=await query("SELECT email,role,two_factor_enabled FROM users WHERE id=$1 AND is_active IS DISTINCT FROM FALSE",[req.user?.userId]);const u=r.rows[0];if(!u)return sendError(res,"Account not found.",404);if(u.two_factor_enabled)return sendError(res,"Two-factor authentication is already enabled.",409);
  const secret=generateTotpSecret();await query("UPDATE users SET two_factor_pending_secret_enc=$1 WHERE id=$2",[encryptTotpSecret(secret),req.user?.userId]);
  return sendSuccess(res,{secret,otpauth_url:totpUri(secret,u.email,u.role),issuer:"EduLearnX",account:u.email},"Add this account to Google Authenticator");
 }catch(error){return fail(res,error,"Unable to start authenticator setup.");}
};
export const confirmTwoFactorSetup: RequestHandler=async(req,res)=>{\n if(req.user?.role==="student")return sendError(res,"Authenticator-app two-factor authentication is not used for student accounts. Student sign-ins use email OTP.",403);
 const parsed=z.object({code:z.string().regex(/^\d{6}$/)}).safeParse(req.body);if(!parsed.success)return sendError(res,"Enter the six-digit code shown in your authenticator app.",400);
 try{
  const r=await query("SELECT two_factor_pending_secret_enc FROM users WHERE id=$1 AND is_active IS DISTINCT FROM FALSE",[req.user?.userId]);const encrypted=r.rows[0]?.two_factor_pending_secret_enc;if(!encrypted)return sendError(res,"Start authenticator setup again.",400);
  let secret:string;try{secret=decryptTotpSecret(encrypted);}catch{return sendError(res,"Authenticator setup is unavailable. Contact support.",503);}
  if(!verifyTotp(secret,parsed.data.code))return sendError(res,"The code does not match. Check your phone and try again.",400);
  await query("UPDATE users SET two_factor_enabled=TRUE,two_factor_secret_enc=two_factor_pending_secret_enc,two_factor_pending_secret_enc=NULL,two_factor_enabled_at=CURRENT_TIMESTAMP,two_factor_last_verified_at=CURRENT_TIMESTAMP,two_factor_defer_used=TRUE WHERE id=$1",[req.user?.userId]);
  await query("DELETE FROM auth_sessions WHERE user_id=$1",[String(req.user?.userId)]);
  clearAuthCookie(res);
  return sendSuccess(res,{enabled:true},"Two-factor authentication is now enabled.");
 }catch{return sendError(res,"Unable to enable two-factor authentication.",503);}
};
export const deferTwoFactorSetup: RequestHandler=async(req,res)=>{\n if(req.user?.role==="student")return sendError(res,"Authenticator-app two-factor authentication is not used for student accounts. Student sign-ins use email OTP.",403);
 try{
  const r=await query(`UPDATE users SET two_factor_required_at=CURRENT_TIMESTAMP+INTERVAL '3 days',two_factor_defer_used=TRUE WHERE id=$1 AND two_factor_enabled=FALSE AND two_factor_defer_used=FALSE AND two_factor_required_at>CURRENT_TIMESTAMP RETURNING two_factor_required_at`,[req.user?.userId]);
  if(!r.rows[0])return sendError(res,"The three-day postponement has already been used or the setup deadline has passed.",409);
  return sendSuccess(res,{required_at:r.rows[0].two_factor_required_at},"Setup postponed for three days");
 }catch{return sendError(res,"Unable to postpone setup.",503);}
};

export const getSession: RequestHandler = async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const token = readSessionToken(req);
  // This public probe also runs for visitors who have never signed in.
  if (!token) return sendSuccess(res,null,"Signed out");
  try {
    const result = await query(
      `SELECT ${profileColumns.split(", ").map(column => `u.${column}`).join(", ")}
       FROM auth_sessions s JOIN users u ON u.id::text = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP
         AND u.is_active IS DISTINCT FROM FALSE`,
      [hashAuthToken(token)],
    );
    if (!result.rows[0]) { clearAuthCookie(res); return sendSuccess(res,null,"Signed out"); }
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
  const SMTP_HOST = process.env.SMTP_HOST;\n  const SMTP_FROM = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER;\n  const SMTP_USER = process.env.SMTP_USER;\n  const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;\n  const APP_URL = process.env.APP_URL;
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
authRouter.post("/register",rateLimit("register",10,60*60*1000),register);\nauthRouter.post("/register/verify-email-otp",rateLimit("register-verify",20,15*60*1000),verifyRegistrationEmailOtp);
authRouter.post("/login",rateLimit("login",20,15*60*1000),login);
authRouter.post("/login/verify-totp",twoFactorLoginVerifyLimiter,rateLimit("login-totp",20,15*60*1000),verifyLoginTotp);\nauthRouter.post("/login/verify-email-otp",twoFactorLoginVerifyLimiter,rateLimit("login-email-otp",20,15*60*1000),verifyLoginEmailOtp);
authRouter.get("/two-factor/status",requireAuth,twoFactorStatusLimiter,getTwoFactorStatus);
authRouter.post("/two-factor/setup",requireAuth,twoFactorSetupLimiter,beginTwoFactorSetup);
authRouter.post("/two-factor/confirm",requireAuth,twoFactorConfirmLimiter,confirmTwoFactorSetup);
authRouter.post("/two-factor/defer",requireAuth,twoFactorDeferLimiter,deferTwoFactorSetup);
authRouter.get("/session",getSession);
authRouter.post("/logout",logout);
authRouter.post("/forgot-password",rateLimit("forgot-password",5,60*60*1000),forgotPassword);
authRouter.post("/reset-password",rateLimit("reset-password",20,15*60*1000),resetPassword);
authRouter.post("/change-password",rateLimit("change-password",20,15*60*1000),requireAuth,changePassword);
