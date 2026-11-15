import { RequestHandler } from "express";
import { z } from "zod";
import { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";
import { transaction } from "../utils/transaction.js";
import { HttpError, respondError } from "../utils/errors.js";
import { idSchema, phoneSchema, pageSchema } from "../../shared/validation.js";
import { claimUpload, uploadReference } from "./uploads.js";
import { signedDownload, storageFetch, objectPath, validateFile } from "../utils/storage.js";
import { hashPassword, isValidPassword } from "../utils/password.js";

const applicationSchema = z.object({
  full_name: z.string().trim().min(2).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: phoneSchema.optional(),
  expertise: z.string().trim().min(2).max(255),
  experience_years: z.number().int().min(0).max(60),
  certificate_1: uploadReference.nullable().optional(),
  certificate_2: uploadReference.nullable().optional(),
  certificate_3: uploadReference.nullable().optional(),
  bio: z.string().trim().min(20).max(10000),
  password: z.string().refine(isValidPassword, "Use at least 8 characters and at most 72 UTF-8 bytes"),
});

const applicationSelect = `
  SELECT
    id,
    full_name,
    email,
    phone,
    expertise,
    experience_years,
    (certificate_1 IS NOT NULL) AS certificate_1,
    (certificate_2 IS NOT NULL) AS certificate_2,
    (certificate_3 IS NOT NULL) AS certificate_3,
    bio,
    status,
    requested_at,
    reviewed_at,
    reviewed_by
  FROM tutor_applications
`;

export const getTutorApplications: RequestHandler = async (req, res) => {
  try {
    const {page,limit}=pageSchema.parse(req.query);
    const status=req.query.status ? z.enum(["pending","approved","rejected"]).parse(req.query.status) : undefined;
    const params: unknown[] = [];
    let sql = applicationSelect;

    if (status) {
      params.push(String(status));
      sql += " WHERE status = $1";
    }

    params.push(limit,(page-1)*limit);
    sql += ` ORDER BY requested_at DESC,id DESC LIMIT $${params.length-1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return sendSuccess(res, result.rows, "Tutor applications fetched successfully");
  } catch (error) {
    return respondError(res,error,"Failed to fetch tutor applications");
  }
};

export const createTutorApplication: RequestHandler = async (req,res) => {
  try {
    const input=applicationSchema.strict().parse(req.body);
    const passwordHash=await hashPassword(input.password);
    const result=await transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`tutor:${input.email}`]);
      if((await client.query("SELECT id FROM tutor_applications WHERE lower(email)=$1 AND status='pending'",[input.email])).rows.length) throw new HttpError(409,"A pending tutor application already exists for this email");
      const paths:(string|null)[]=[];
      for(const ref of [input.certificate_1,input.certificate_2,input.certificate_3]) paths.push(ref ? await claimUpload(client,ref,'certificate') : null);
      return (await client.query(`INSERT INTO tutor_applications(full_name,email,phone,expertise,experience_years,certificate_1,certificate_2,certificate_3,bio,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status,requested_at`,[input.full_name,input.email,input.phone||null,input.expertise,input.experience_years,...paths,input.bio,passwordHash])).rows[0];
    });
    return sendSuccess(res,result,'Tutor application submitted for review',201);
  }catch(error){return respondError(res,error,'Failed to submit tutor application');}
};

export const getTutorCertificate:RequestHandler=async(req,res)=>{
  try {
    const id=idSchema.parse(req.params.id),slot=z.enum(['1','2','3']).parse(req.params.slot);
    const path=await transaction(async client=>{
      const row=(await client.query(`SELECT certificate_${slot} AS value FROM tutor_applications WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if(!row?.value) throw new HttpError(404,'Certificate not found');
      if(!row.value.startsWith('data:')) return row.value as string;
      // Migrate a legacy embedded certificate only when an authorized reviewer opens it.
      const match=/^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/]*={0,2})$/.exec(row.value);
      if(!match) throw new HttpError(400,'Legacy certificate has an invalid format.');
      const bytes=Buffer.from(match[2],'base64');validateFile(bytes,match[1]);
      const path=`legacy/${id}/${slot}`;
      await storageFetch(`/object/tutor-certificates/${objectPath(path)}`,{method:'POST',headers:{'Content-Type':match[1],'x-upsert':'true'},body:new Blob([Uint8Array.from(bytes)],{type:match[1]})});
      await client.query(`UPDATE tutor_applications SET certificate_${slot}=$1 WHERE id=$2`,[path,id]);
      return path;
    });
    res.setHeader('Cache-Control','no-store');return sendSuccess(res,{url:await signedDownload('tutor-certificates',path)},'Certificate ready');
  }catch(error){return respondError(res,error,'Unable to open certificate');}
};

export const reviewTutorApplication: RequestHandler = async (req,res) => {
  try {
    const id=idSchema.parse(req.params.id);
    const status=z.enum(["approved","rejected"]).parse(req.body.status);
    const application=await transaction(async client => {
      const existing=(await client.query("SELECT * FROM tutor_applications WHERE id=$1 FOR UPDATE",[id])).rows[0];
      if (!existing) throw new HttpError(404,"Tutor application not found");
      if (existing.status===status) return {id:existing.id,status};
      if (existing.status!=="pending") throw new HttpError(409,"This application has already been reviewed");
      if (status==="approved") {
        const user=(await client.query("SELECT id,role FROM users WHERE lower(email)=$1 FOR UPDATE",[existing.email.toLowerCase()])).rows[0];
        if (user && user.role!=="teacher") throw new HttpError(409,"This email already belongs to a non-teacher account");
        if (!user) await client.query("INSERT INTO users(email,password_hash,full_name,name,role,phone) VALUES($1,$2,$3,$3,'teacher',$4)",[existing.email,existing.password_hash,existing.full_name,existing.phone]);
      }
      return (await client.query("UPDATE tutor_applications SET status=$1,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$2 WHERE id=$3 RETURNING id,status,reviewed_at,reviewed_by",[status,req.user?.userId,id])).rows[0];
    });
    return sendSuccess(res,application,`Tutor application ${status}`);
  } catch(error) { return respondError(res,error,"Failed to review tutor application"); }
};
