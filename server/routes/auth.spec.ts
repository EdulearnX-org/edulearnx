import type {Request,Response} from "express";
import crypto from "node:crypto";
import {afterEach,beforeAll,beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../db/connection.js",()=>({default:{connect:vi.fn()},query:vi.fn()}));
vi.mock("nodemailer",()=>({default:{createTransport:vi.fn()}}));
import pool,{query} from "../db/connection.js";
import nodemailer from "nodemailer";
import {hashPassword} from "../utils/password.js";
import {hashAuthToken} from "../utils/authMiddleware.js";
import {login,register,logout,forgotPassword,resetPassword,changePassword} from "./auth.js";
const db=vi.fn();const release=vi.fn();const sendMail=vi.fn();
const token=crypto.randomBytes(32).toString("base64url");
let passwordHash:string;
const user={id:12,email:"admin@example.com",full_name:"Admin",role:"admin",is_active:true,phone:null,profile_image_url:null};
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
  const res=response();await register(req({email:user.email,password:"new-password",full_name:"New Admin",role:"admin"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);expect(res.cookie).not.toHaveBeenCalled();
  expect(db.mock.calls.some(([sql])=>sql.startsWith("UPDATE users"))).toBe(false);
 });
 it("always creates students even when the request forges an admin role",async()=>{
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("INSERT INTO users")?[{...user,role:"student"}]:[]}));
  const res=response();await register(req({email:"new@example.com",password:"new-password",full_name:"New Student",role:"admin"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(201);
  expect(db).toHaveBeenCalledWith(expect.stringContaining("VALUES ($1,$2,$3,$3,'student')"),["new@example.com",expect.stringMatching(/^\$2/),"New Student"]);
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
 it("emails a short-lived token, stores only its hash, and never returns the token",async()=>{
  vi.stubEnv("SMTP_HOST","localhost");vi.stubEnv("SMTP_FROM","support@example.com");vi.stubEnv("APP_URL","http://localhost:5173");
  db.mockImplementation(async(sql:string)=>({rows:sql.startsWith("SELECT")?[{id:12}]:[]}));
  const res=response();await forgotPassword(req({email:user.email}),res,vi.fn());
  const text=sendMail.mock.calls[0][0].text as string;const rawToken=new URL(text.match(/http[^\s]+/)![0]).searchParams.get("token")!;
  expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
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
