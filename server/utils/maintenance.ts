import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { query } from '../db/connection.js';
import { transaction } from './transaction.js';
import { deleteObject } from './storage.js';
import { receiptIsReferenced,retryEnrollmentReceiptCleanup } from '../routes/enrollmentRequests.js';
import { respondError } from './errors.js';

export async function runMaintenance() {
  await retryEnrollmentReceiptCleanup();
  const candidates=await query("SELECT id FROM upload_intents WHERE status<>'claimed' AND expires_at<NOW() ORDER BY expires_at LIMIT 25");
  for(const {id} of candidates.rows) {
    await transaction(async client=>{
      const intent=(await client.query("SELECT * FROM upload_intents WHERE id=$1 AND status<>'claimed' AND expires_at<NOW() FOR UPDATE SKIP LOCKED",[id])).rows[0];
      if(!intent) return;
      if(intent.purpose==='receipt' && await receiptIsReferenced(intent.object_path)) {
        await client.query("UPDATE upload_intents SET status='claimed' WHERE id=$1",[id]);return;
      }
      await deleteObject(intent.bucket,intent.object_path);
      await client.query('DELETE FROM upload_intents WHERE id=$1',[id]);
    });
  }
  await query('DELETE FROM request_limits WHERE expires_at<NOW()');
  await query("DELETE FROM class_schedule_batches WHERE created_at<NOW()-INTERVAL '90 days'");
  return {processed:candidates.rows.length};
}
export const maintenanceHandler:RequestHandler=async(req,res)=>{
  const expected=process.env.CRON_SECRET;
  const supplied=req.headers.authorization||'';
  const target=`Bearer ${expected}`;
  if(!expected || supplied.length!==target.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(target))) {res.status(401).json({success:false,error:'Unauthorized'});return;}
  try { res.json({success:true,data:await runMaintenance()}); }
  catch(error){respondError(res,error,'Maintenance did not complete. Retry the scheduled job.');}
};
