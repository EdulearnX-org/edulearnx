import type {Request,Response} from "express";
import crypto from "node:crypto";
import {afterEach,beforeAll,beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../db/connection.js",()=>({default:{connect:vi.fn()},query:vi.fn()}));
vi.mock("nodemailer",()=>({default:{createTransport:vi.fn()}}));
import pool,{query} from "../db/connection.js";
import nodemailer from "nodemailer";
import {hashPassword} from "../utils/password.js";
import {hashAuthToken} from "../utils/authMiddleware.js";
import {getSession,login,register,logout,forgotPassword,resetPassword,changePassword} from "./auth.js";
const db=vi.fn();const release=vi.fn();const sendMail=vi.fn();
const token=crypto.randomBytes(32).toString("hex");
let passwordHash:string;
const user={id:12,email:"admin@example.com",full_name:"Admin",role:"admin",is_active:true,phone:null,profile_image_url:null,two_factor_enabled:false,two_factor_required_at:null};
function response(){const res={status:vi.fn(),json:vi.fn(),cookie:vi.fn(),clearCookie:vi.fn(),setHeader:vi.fn()} as unknown as Response;vi.mocked(res.status).mockReturnValue(res);return res;}
function req(body:unknown,extra:Record<string,unknown>={}){return {body,headers:{},...extra} as Request;}
beforeAll(async()=>{passwordHash=await hashPassword("existing-password");});
beforeEach(()=>{
 db.mockReset().mockResolvedValue({rows:[]});release.mockReset();vi.mocked(query).mockReset().mockResolvedValue({rows:[]} as never);
 vi.mocked(pool.connect).mockResolvedValue({query:db,release} as never);
 sendMail.mockReset().mockResolvedValue({});vi.mocked(nodemailer.createTransport).mockReturnValue({sendMail} as never);
});
afterEach(()=>vi.unstubAllEnvs());
describe("app-owned authentication",()=>{
 it.each([undefined,"auth_token=invalid","auth_token=%ZZ"])("returns an uncached signed-out session without querying the database (%s)",async(cookie)=>{
  const res=response();await getSession(req({}, {headers:{cookie}}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,data:null}));
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store");
  expect(query).not.toHaveBeenCalled();
 });
 it("loads only the public profile belonging to the hashed session cookie",async()=>{
  vi.mocked(query).mockResolvedValue({rows:[{...user,password_hash:"not-public"}]} as never);
  const res=response();await getSession(req({}, {headers:{cookie:`auth_token=${token}`},user:{userId:999}}),res,vi.fn());
  expect(query).toHaveBeenCalledWith(expect.stringContaining("s.token_hash = $1"),[hashAuthToken(token)]);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("s.expires_at > CURRENT_TIMESTAMP"),expect.any(Array));
  expect(query).toHaveBeenCalledWith(expect.stringContaining("u.is_active IS DISTINCT FROM FALSE"),expect.any(Array));
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,data:user}));
  expect(res.clearCookie).not.toHaveBeenCalled();
 });
 it("clears an expired or revoked session and returns the signed-out state",async()=>{
  const res=response();await getSession(req({}, {headers:{cookie:`auth_token=${token}`}}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,data:null}));
  expect(res.clearCookie).toHaveBeenCalledWith("auth_token",expect.objectContaining({path:"/api"}));
 });
 it("reports a session database outage without clearing a potentially valid cookie",async()=>{
  vi.mocked(query).mockRejectedValue(new Error("Database unavailable"));
  const res=response();await getSession(req({}, {headers:{cookie:`auth_token=${token}`}}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:false}));
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control","no-store");
  expect(res.clearCookie).not.toHaveBeenCalled();
 });
 it("signs in existing password owners without changing their role and stores only token hashes",async()=>{
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{...user,password_hash:passwordHash}]:[]}));
  const res=response();await login(req({email:" ADMIN@example.com ",password:"existing-password"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(200);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({role:"admin"})}));
  const [name,cookieValue,options]=vi.mocked(res.cookie).mock.calls[0] as unknown as [string,string,Record<string,unknown>];
  expect(name).toBe("auth_token");expect(cookieValue).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(options).toMatchObject({httpOnly:true,sameSite:"lax",path:"/api"});
  expect(db).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO auth_sessions"),[hashAuthToken(cookieValue),"12",expect.any(Date)]);
  expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain("password_hash");
 });
 it.each([{password:"wrong-password",active:true},{password:"existing-password",active:false}])("rejects incorrect or inactive sign-in (%j)",async({password,active})=>{
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{...user,is_active:active,password_hash:passwordHash}]:[]}));
  const res=response();await login(req({email:user.email,password}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(401);expect(res.cookie).not.toHaveBeenCalled();
  expect(db.mock.calls.some(([sql])=>sql.includes("INSERT INTO auth_sessions"))).toBe(false);
 });
 it("never claims an existing profile through registration",async()=>{
  vi.stubEnv("SMTP_HOST","localhost");vi.stubEnv("SMTP_USER","mailer@example.com");vi.stubEnv("SMTP_PASS","secret");vi.stubEnv("EMAIL_FROM","mailer@example.com");vi.stubEnv("APP_URL","http://localhost:5173");
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT id FROM users")?[{id:12}]:[]}));
  const res=response();await register(req({email:user.email,password:"new-password",full_name:"New Admin",role:"admin"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);expect(res.cookie).not.toHaveBeenCalled();
  expect(db.mock.calls.some(([sql])=>sql.startsWith("UPDATE users"))).toBe(false);
 });
 it("sends a registration OTP without creating a session before email verification",async()=>{
  vi.stubEnv("SMTP_HOST","localhost");vi.stubEnv("SMTP_USER","mailer@example.com");vi.stubEnv("SMTP_PASS","secret");vi.stubEnv("EMAIL_FROM","mailer@example.com");vi.stubEnv("APP_URL","http://localhost:5173");
  const res=response();await register(req({email:"new@example.com",password:"new-password",full_name:"New Student",role:"admin"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(202);expect(res.cookie).not.toHaveBeenCalled();
  expect(db).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO pending_student_registrations"),expect.arrayContaining(["new@example.com",expect.any(String),expect.any(String),expect.any(String),expect.any(Date)]));
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({to:"new@example.com",subject:"Verify your EduLearnX email"}));
 });
 it("revokes the current database session before clearing its cookie",async()=>{
  const res=response();await logout(req({}, {headers:{cookie:`auth_token=${token}`}}),res,vi.fn());
  expect(query).toHaveBeenCalledWith("DELETE FROM auth_sessions WHERE token_hash=$1",[hashAuthToken(token)]);
  expect(res.clearCookie).toHaveBeenCalledWith("auth_token",expect.objectContaining({path:"/api"}));
 });
 it("reports missing email configuration without exposing a reset token",async()=>{
  vi.stubEnv("SMTP_HOST","");const res=response();await forgotPassword(req({email:user.email}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(503);expect(sendMail).not.toHaveBeenCalled();
 });
 it("uses the configured Gmail app password for SMTP delivery",async()=>{
  vi.stubEnv("GMAIL_USER","official.edulearnx@gmail.com");vi.stubEnv("GMAIL_APP_PASSWORD","gmail-app-password");vi.stubEnv("EMAIL_FROM_NAME","EduLearnX");vi.stubEnv("APP_URL","https://edulearnx.org");
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{id:12}]:[]}));
  const res=response();await forgotPassword(req({email:user.email}),res,vi.fn());
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({host:"smtp.gmail.com",port:587,secure:false,auth:{user:"official.edulearnx@gmail.com",pass:"gmail-app-password"}}));
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({from:"EduLearnX <official.edulearnx@gmail.com>",to:user.email}));
 });
 it("emails a short-lived token, stores only its hash, and never returns the token",async()=>{
  vi.stubEnv("SMTP_HOST","localhost");vi.stubEnv("SMTP_FROM","support@example.com");vi.stubEnv("APP_URL","http://localhost:5173");
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{id:12}]:[]}));
  const res=response();await forgotPassword(req({email:user.email}),res,vi.fn());
  const text=sendMail.mock.calls[0][0].text as string;const rawToken=new URL(text.match(/http[^\s]+/)![0]).searchParams.get("token")!;
  expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
  expect(sendMail.mock.calls[0][0].html).toContain("Reset my password");
  expect(sendMail.mock.calls[0][0].html).toContain("/logo.png");
  expect(db).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO password_reset_tokens"),[hashAuthToken(rawToken),"12",expect.any(Date),"12"]);
  expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain(rawToken);
 });
 it("consumes reset tokens and revokes every existing session atomically",async()=>{
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{id:12}]:[]}));
  const res=response();await resetPassword(req({token,password:"replacement-password"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(200);
  expect(db).toHaveBeenCalledWith("DELETE FROM password_reset_tokens WHERE user_id=$1",["12"]);
  expect(db).toHaveBeenCalledWith("DELETE FROM auth_sessions WHERE user_id=$1",["12"]);
  const order=db.mock.calls.map(([sql])=>sql);expect(order[0]).toBe("BEGIN");expect(order[order.length-1]).toBe("COMMIT");
 });
 it("rejects already-used or expired reset tokens without changing the password",async()=>{
  const res=response();await resetPassword(req({token,password:"replacement-password"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);expect(db).toHaveBeenCalledWith("ROLLBACK");
  expect(db.mock.calls.some(([sql])=>sql.startsWith("UPDATE users"))).toBe(false);
 });
 it("requires the current password for authenticated password changes",async()=>{
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{...user,password_hash:passwordHash}]:[]}));
  const res=response();await changePassword(req({current_password:"wrong",password:"replacement-password"},{user:{userId:12}}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(401);expect(res.cookie).not.toHaveBeenCalled();
 });
});
