import type {Request,Response} from "express";
import {beforeEach,describe,it,expect,vi} from "vitest";
vi.mock("../db/connection.js",()=>({query:vi.fn()}));
import {query} from "../db/connection.js";
import {updateUser,deleteUser,createUser} from "./users.js";
import {requireAdminSelfOrUserManagement} from "../utils/adminPermissionMiddleware.js";
function response(){const res={status:vi.fn(),json:vi.fn()} as unknown as Response;vi.mocked(res.status).mockReturnValue(res);return res;}
function req(userId:number,role:string,targetId:number,body:unknown={}){return {user:{userId,email:"actor@example.com",role},params:{id:String(targetId)},body} as unknown as Request;}
beforeEach(()=>vi.mocked(query).mockReset());
describe("safe profile and admin target access",()=>{
 it("permits student self-profile access through routing middleware",async()=>{
  const next=vi.fn();await requireAdminSelfOrUserManagement(req(12,"student",12),response(),next);
  expect(next).toHaveBeenCalledOnce();expect(query).not.toHaveBeenCalled();
 });
 it("rejects self-role escalation and direct activation changes",async()=>{
  const roleResponse=response();await updateUser(req(12,"student",12,{role:"admin"}),roleResponse,vi.fn());
  expect(roleResponse.status).toHaveBeenCalledWith(400);
  const activeResponse=response();await updateUser(req(12,"student",12,{is_active:true}),activeResponse,vi.fn());
  expect(activeResponse.status).toHaveBeenCalledWith(403);expect(query).not.toHaveBeenCalled();
 });
 it("allows clearing one's own phone number without altering roles or activation",async()=>{
  vi.mocked(query).mockResolvedValueOnce({rows:[{id:12,email:"actor@example.com",role:"student"}]} as never)
    .mockResolvedValueOnce({rows:[{id:12,phone:null}]} as never);
  const res=response();await updateUser(req(12,"student",12,{phone:""}),res,vi.fn());
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("phone=CASE WHEN"),[null,true,null,false,null,null,"12"]);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true}));
 });
 it("prevents a user-manager co-admin from disabling the primary admin",async()=>{
  vi.mocked(query).mockResolvedValueOnce({rows:[{id:1,email:"team@edulearnx.ibi",role:"admin"}]} as never);
  const res=response();await updateUser(req(12,"admin",1,{is_active:false}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);expect(query).toHaveBeenCalledTimes(1);
 });
 it("prevents a co-admin deleting another admin",async()=>{
  vi.mocked(query).mockResolvedValueOnce({rows:[{id:2,email:"other@example.com",role:"admin"}]} as never);
  const res=response();await deleteUser(req(12,"admin",2),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);expect(query).toHaveBeenCalledTimes(1);
 });
 it("prevents co-admins creating new admins through user management",async()=>{
  const res=response();await createUser(req(12,"admin",0,{email:"other@example.com",full_name:"Other Admin",role:"admin"}),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);expect(query).not.toHaveBeenCalled();
 });
});
