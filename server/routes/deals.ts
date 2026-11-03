import type { RequestHandler } from "express";
import { z } from "zod";
import { query } from "../db/connection.js";
import { transaction } from "../utils/transaction.js";
import { HttpError, respondError } from "../utils/errors.js";
import { idSchema, moneySchema, instantSchema } from "../../shared/validation.js";
import { hasAdminFeatureAccess } from "../utils/adminPermissionMiddleware.js";

const cleanCode = (value: unknown) => String(value ?? "").trim().toUpperCase();
const bundleSchema = z.object({
  name: z.string().trim().min(1).max(255), description: z.string().trim().max(10000).nullable().optional(),
  price_cents: moneySchema, course_ids: z.array(idSchema).min(2).max(100).refine(ids => new Set(ids).size === ids.length, "Choose distinct courses"),
  starts_at: instantSchema.nullable().optional(), ends_at: instantSchema.nullable().optional(), is_active: z.boolean().optional(),
}).strict();

export const getBundles: RequestHandler = async (req, res) => {
  try {
    const admin = req.user?.role === "admin" && await hasAdminFeatureAccess(req.user.userId, "deals");
    const result = await query(`SELECT b.*, COALESCE(json_agg(json_build_object('id', c.id, 'title', c.title, 'price_cents', c.price_cents) ORDER BY c.title) FILTER (WHERE c.id IS NOT NULL), '[]') AS courses
      FROM bundle_deals b LEFT JOIN bundle_deal_courses bc ON bc.bundle_id=b.id LEFT JOIN courses c ON c.id=bc.course_id
      ${admin ? "" : `WHERE b.is_active=true AND (b.starts_at IS NULL OR b.starts_at<=CURRENT_TIMESTAMP)
        AND (b.ends_at IS NULL OR b.ends_at>CURRENT_TIMESTAMP)
        AND NOT EXISTS (SELECT 1 FROM bundle_deal_courses links JOIN courses draft ON draft.id=links.course_id WHERE links.bundle_id=b.id AND draft.is_published IS DISTINCT FROM TRUE)`}
      GROUP BY b.id ORDER BY b.created_at DESC`);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: result.rows });
  } catch (error) { return respondError(res,error,"Failed to fetch bundles"); }
};

function saveBundle(create: boolean): RequestHandler {
  return async (req,res) => {
    try {
      const patch = create ? bundleSchema.parse(req.body) : bundleSchema.partial().parse(req.body);
      const id = create ? undefined : idSchema.parse(req.params.id);
      const bundle = await transaction(async client => {
        const existing = create ? {} : (await client.query("SELECT * FROM bundle_deals WHERE id=$1 FOR UPDATE",[id])).rows[0];
        if (!existing) throw new HttpError(404,"Bundle not found");
        const values = { ...existing, ...patch };
        if (values.starts_at && values.ends_at && new Date(values.starts_at) >= new Date(values.ends_at)) throw new HttpError(400,"End date must be after start date");
        if (patch.course_ids) {
          const courses = await client.query("SELECT id FROM courses WHERE id::text=ANY($1::text[]) FOR SHARE",[patch.course_ids]);
          if (courses.rows.length !== patch.course_ids.length) throw new HttpError(400,"One or more courses do not exist");
        }
        const params = [values.name,values.description || null,values.price_cents,values.starts_at || null,values.ends_at || null,values.is_active ?? true];
        const result = create
          ? await client.query("INSERT INTO bundle_deals(name,description,price_cents,starts_at,ends_at,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",params)
          : await client.query("UPDATE bundle_deals SET name=$1,description=$2,price_cents=$3,starts_at=$4,ends_at=$5,is_active=$6,updated_at=CURRENT_TIMESTAMP WHERE id=$7 RETURNING *",[...params,id]);
        if (patch.course_ids) {
          await client.query("DELETE FROM bundle_deal_courses WHERE bundle_id=$1",[result.rows[0].id]);
          for (const course of patch.course_ids) await client.query("INSERT INTO bundle_deal_courses(bundle_id,course_id) VALUES($1,$2)",[result.rows[0].id,course]);
        }
        return result.rows[0];
      });
      return res.status(create ? 201 : 200).json({success:true,data:bundle});
    } catch (error) { return respondError(res,error,"Unable to save bundle"); }
  };
}
export const createBundle = saveBundle(true);
export const updateBundle = saveBundle(false);
export const deleteBundle: RequestHandler = async(req,res) => {
  try {
    const result=await query("DELETE FROM bundle_deals WHERE id=$1 RETURNING id",[idSchema.parse(req.params.id)]);
    if (!result.rows[0]) throw new HttpError(404,"Bundle not found");
    return res.json({success:true,data:result.rows[0]});
  } catch(error) { return respondError(res,error,"Unable to delete bundle"); }
};

export const getPromoCodes: RequestHandler = async (_req, res) => {
  try { const result = await query("SELECT * FROM promo_codes ORDER BY created_at DESC"); res.json({ success: true, data: result.rows }); }
  catch (error) { console.error("Error fetching promo codes:", error); res.status(500).json({ success: false, error: "Failed to fetch promo codes" }); }
};

export const createPromoCode: RequestHandler = async (req, res) => {
  const code = cleanCode(req.body.code); const type = req.body.discount_type; const value = Number(req.body.discount_value);
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !["percent", "fixed"].includes(type) || !Number.isInteger(value) || value <= 0 || (type === "percent" && value > 100)) return res.status(400).json({ success: false, error: "Use a valid code and discount (percent 1-100 or fixed amount in cents)" });
  if (req.body.starts_at && req.body.ends_at && new Date(req.body.starts_at) >= new Date(req.body.ends_at)) return res.status(400).json({ success: false, error: "End date must be after start date" });
  try { const result = await query("INSERT INTO promo_codes (code, discount_type, discount_value, starts_at, ends_at, max_redemptions, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [code, type, value, req.body.starts_at || null, req.body.ends_at || null, req.body.max_redemptions ? Number(req.body.max_redemptions) : null, req.body.is_active !== false]); res.status(201).json({ success: true, data: result.rows[0], message: "Promo code created" }); }
  catch (error: any) { res.status(error?.code === "23505" ? 409 : 500).json({ success: false, error: error?.code === "23505" ? "That promo code already exists" : "Failed to create promo code" }); }
};

export const updatePromoCode: RequestHandler = async (req, res) => {
  try { const result = await query("UPDATE promo_codes SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *", [Boolean(req.body.is_active), req.params.id]); if (!result.rows.length) return res.status(404).json({ success: false, error: "Promo code not found" }); res.json({ success: true, data: result.rows[0] }); }
  catch (error) { res.status(500).json({ success: false, error: "Failed to update promo code" }); }
};

export const deletePromoCode: RequestHandler = async (req, res) => {
  try { const result = await query("DELETE FROM promo_codes WHERE id = $1 RETURNING id", [req.params.id]); if (!result.rows.length) return res.status(404).json({ success: false, error: "Promo code not found" }); res.json({ success: true, data: result.rows[0] }); }
  catch (error) { res.status(500).json({ success: false, error: "Failed to delete promo code" }); }
};
