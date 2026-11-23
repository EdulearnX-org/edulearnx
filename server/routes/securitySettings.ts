import type { RequestHandler } from "express";
import { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
export const getStudentSecuritySettings: RequestHandler = async (req,res) => {
 if(req.user?.role!=="student")return sendError(res,"Student access required.",403);
 try{const [u,p]=await Promise.all([query("SELECT student_email_otp_enabled FROM users WHERE id=$1",[req.user.userId]),query("SELECT setting_value FROM app_settings WHERE setting_key=$1",["student_email_otp_required"])]);if(!u.rows[0])return sendError(res,"Account not found.",404);const required=p.rows[0]?.setting_value!=="false";return sendSuccess(res,{email_otp_enabled:required||u.rows[0].student_email_otp_enabled!==false,admin_required:required},"Security settings loaded.");}catch{return sendError(res,"Unable to load security settings.",503);}
};
export const updateStudentSecuritySettings: RequestHandler = async (req,res) => {
 if(req.user?.role!=="student")return sendError(res,"Student access required.",403);
 if(typeof req.body?.email_otp_enabled!=="boolean")return sendError(res,"Choose whether email OTP is enabled.",400);
 try{const p=await query("SELECT setting_value FROM app_settings WHERE setting_key=$1",["student_email_otp_required"]);if(p.rows[0]?.setting_value!=="false")return sendError(res,"Your administrator requires email OTP. You cannot turn it off.",403);const u=await query("UPDATE users SET student_email_otp_enabled=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND role='student' RETURNING student_email_otp_enabled",[req.body.email_otp_enabled,req.user.userId]);if(!u.rows[0])return sendError(res,"Student account not found.",404);return sendSuccess(res,{email_otp_enabled:u.rows[0].student_email_otp_enabled,admin_required:false},"Email OTP preference saved.");}catch{return sendError(res,"Unable to save security preference.",503);}
};
export const getAdminSecuritySettings: RequestHandler = async (_req,res) => {try{const r=await query("SELECT setting_value FROM app_settings WHERE setting_key=$1",["student_email_otp_required"]);return sendSuccess(res,{student_email_otp_required:r.rows[0]?.setting_value!=="false"},"Student security policy loaded.");}catch{return sendError(res,"Unable to load student security policy.",503);}};
export const updateAdminSecuritySettings: RequestHandler = async (req,res) => {
 if(typeof req.body?.student_email_otp_required!=="boolean")return sendError(res,"Provide a valid OTP policy.",400);
 try{const r=await query(`INSERT INTO app_settings(setting_key,setting_value,updated_at,updated_by) VALUES($1,$2,CURRENT_TIMESTAMP,$3) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=CURRENT_TIMESTAMP,updated_by=EXCLUDED.updated_by RETURNING setting_value`,["student_email_otp_required",String(req.body.student_email_otp_required),String(req.user?.userId)]);return sendSuccess(res,{student_email_otp_required:r.rows[0].setting_value==="true"},"Student OTP policy updated.");}catch{return sendError(res,"Unable to update student OTP policy.",503);}
};