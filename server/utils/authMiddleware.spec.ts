import type { Request,Response } from "express";
import { beforeEach,describe,expect,it,vi } from "vitest";
import crypto from "node:crypto";
vi.mock("../db/connection.js",()=>({query:vi.fn()}));
import {query} from "../db/connection.js";
import {requireAuth} from "./authMiddleware.js";
const token=Buffer.alloc(32,7).toString("base64url");
function response(){const res={status:vi.fn(),json:vi.fn()} as unknown as Response;vi.mocked(res.status).mockReturnValue(res);return res;}
beforeEach(()=>vi.mocked(query).mockReset());
describe("database sessions",()=>{
 it("looks up only the token digest and reloads the current database role",async()=>{
  vi.mocked(query).mockResolvedValueOnce({rows:[{id:7,email:"student@example.com",role:"student",is_active:true}]} as never);
  const req={headers:{cookie:`auth_token=${token}`}} as Request;
  const next=vi.fn();await requireAuth(req,response(),next);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("expires_at > CURRENT_TIMESTAMP"),[crypto.createHash("sha256").update(token).digest("hex")]);
  expect(req.user).toEqual({userId:7,email:"student@example.com",role:"student"});expect(next).toHaveBeenCalledOnce();
 });
 it.each([{rows:[]},{rows:[{id:7,is_active:false}]}])("rejects revoked, expired, or disabled sessions (%j)",async({rows})=>{
  vi.mocked(query).mockResolvedValueOnce({rows} as never);const res=response();const next=vi.fn();
  await requireAuth({headers:{cookie:`auth_token=${token}`}} as Request,res,next);
  expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();
 });
 it("does not accept former Supabase bearer JWTs",async()=>{
  const res=response();await requireAuth({headers:{authorization:"Bearer old.jwt.token"}} as Request,res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(401);expect(query).not.toHaveBeenCalled();
 });
 it("rejects malformed cookies without throwing or touching the database",async()=>{
  const res=response();await requireAuth({headers:{cookie:"auth_token=%ZZ"}} as Request,res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(401);expect(query).not.toHaveBeenCalled();
 });
});
