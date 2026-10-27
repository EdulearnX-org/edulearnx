import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./connection.js",()=>({default:{},isDatabaseConfigured:false}));
import {authSchemaSql} from "./authSchema.js";
let db:PGlite | undefined;
afterEach(async()=>{await db?.close();db=undefined;});
describe("local auth migration compatibility",()=>{
 it("preserves legacy required audit creators and supports issuing reset tokens",async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE users (id SERIAL PRIMARY KEY,email TEXT NOT NULL);
   INSERT INTO users(email) VALUES ('student@example.com');
   CREATE TABLE password_reset_tokens (
    token_hash CHAR(64) PRIMARY KEY,user_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL
   );
   INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_by)
   VALUES (repeat('a',64),'1',CURRENT_TIMESTAMP+interval '30 minutes','legacy-admin');`);
  await db.exec(authSchemaSql);
  await db.query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_by) VALUES($1,$2,$3,$4)",["b".repeat(64),"1",new Date(Date.now()+30*60*1000),"1"]);
  const rows=await db.query<{created_by:string}>("SELECT created_by FROM password_reset_tokens ORDER BY token_hash");
  expect(rows.rows).toEqual([{created_by:"legacy-admin"},{created_by:"1"}]);
  await db.exec(authSchemaSql);
  expect((await db.query("SELECT COUNT(*)::int AS count FROM password_reset_tokens")).rows).toEqual([{count:2}]);
 });
 it("backfills only missing reset-token audit creators on existing tables",async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE users (id UUID PRIMARY KEY,email TEXT NOT NULL);
   CREATE TABLE password_reset_tokens (
    token_hash CHAR(64) PRIMARY KEY,user_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   INSERT INTO password_reset_tokens(token_hash,user_id,expires_at)
   VALUES(repeat('c',64),'user-uuid',CURRENT_TIMESTAMP+interval '30 minutes');`);
  await db.exec(authSchemaSql);
  expect((await db.query("SELECT created_by FROM password_reset_tokens")).rows).toEqual([{created_by:"user-uuid"}]);
  await expect(db.query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)",["d".repeat(64),"user-uuid",new Date()])).rejects.toThrow();
 });
});
