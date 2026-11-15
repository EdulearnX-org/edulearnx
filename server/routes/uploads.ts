import type { RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { transaction } from '../utils/transaction.js';
import { HttpError,respondError } from '../utils/errors.js';
import { storageFetch,storageConfig,objectPath,fileTypes,maxUploadBytes,readObject } from '../utils/storage.js';
export const uploadReference=z.object({upload_id:z.uuid(),upload_token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type UploadReference=z.infer<typeof uploadReference>;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const createUploadIntent:RequestHandler=async(req,res)=>{
  try {
    const input=z.object({purpose:z.enum(['receipt','certificate']),content_type:z.enum(fileTypes),byte_size:z.number().int().min(1).max(maxUploadBytes)}).strict().parse(req.body);
    if(input.purpose==='receipt' && req.user?.role!=='student') throw new HttpError(403,'Sign in with a student account to upload a receipt.');
    if(input.purpose==='certificate' && input.content_type==='image/webp') throw new HttpError(400,'Certificates must be JPEG, PNG, or PDF.');
    const key=digest(`uploads:${req.user?.userId || req.ip}`);
    const count=await query(`INSERT INTO request_limits(key_hash,attempts,expires_at) VALUES($1,1,NOW()+INTERVAL '1 hour') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN request_limits.expires_at<NOW() THEN 1 ELSE request_limits.attempts+1 END,expires_at=CASE WHEN request_limits.expires_at<NOW() THEN NOW()+INTERVAL '1 hour' ELSE request_limits.expires_at END RETURNING attempts`,[key]);
    if(count.rows[0].attempts>30) throw new HttpError(429,'Too many uploads. Please try again later.');
    const id=randomUUID(),token=randomBytes(32).toString('hex');
    const bucket=input.purpose==='receipt'?'payment-receipts':'tutor-certificates';
    const path=`uploads/${id}`;
    await query('INSERT INTO upload_intents(id,token_hash,owner_id,purpose,bucket,object_path,content_type,byte_size) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,digest(token),req.user?.userId||null,input.purpose,bucket,path,input.content_type,input.byte_size]);
    const response=await storageFetch(`/object/upload/sign/${bucket}/${objectPath(path)}`,{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'false'},body:'{}'});
    const signed=await response.json() as {url:string};
    const url=new URL(`${storageConfig().url}/storage/v1${signed.url}`);
    if(url.origin!==new URL(storageConfig().url).origin || !url.searchParams.has('token')) throw new Error('Invalid signed upload URL');
    res.status(201).json({success:true,data:{upload_id:id,upload_token:token,upload_url:url.toString()}});
  } catch(error){respondError(res,error,'Unable to start upload');}
};
// Caller holds this lock until its owning record has been saved. A rollback makes the intent reusable.
export async function claimUpload(client:PoolClient,reference:UploadReference,purpose:'receipt'|'certificate',owner?:string) {
  const ref=uploadReference.parse(reference);
  const row=(await client.query('SELECT * FROM upload_intents WHERE id=$1 FOR UPDATE',[ref.upload_id])).rows[0];
  if(!row || row.token_hash!==digest(ref.upload_token) || row.purpose!==purpose || (purpose==='receipt' && String(row.owner_id)!==String(owner))) throw new HttpError(400,'Invalid upload reference.');
  if(row.status!=='pending' || new Date(row.expires_at).getTime()<=Date.now()) throw new HttpError(409,'Upload has expired or was already submitted. Upload the file again.');
  await readObject(row.bucket,row.object_path,row.byte_size,row.content_type);
  await client.query("UPDATE upload_intents SET status='claimed' WHERE id=$1",[row.id]);
  return row.object_path as string;
}
