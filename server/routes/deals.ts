import { RequestHandler } from "express";
import { query } from "../db/connection.js";

const cleanCode = (value: unknown) => String(value ?? "").trim().toUpperCase();

export const getBundles: RequestHandler = async (_req, res) => {
  try {
    const result = await query(`SELECT b.*, COALESCE(json_agg(json_build_object('id', c.id, 'title', c.title, 'price_cents', c.price_cents) ORDER BY c.title) FILTER (WHERE c.id IS NOT NULL), '[]') AS courses
      FROM bundle_deals b LEFT JOIN bundle_deal_courses bc ON bc.bundle_id = b.id LEFT JOIN courses c ON c.id = bc.course_id
      GROUP BY b.id ORDER BY b.created_at DESC`);
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error("Error fetching bundles:", error); res.status(500).json({ success: false, error: "Failed to fetch bundles" }); }
};

export const createBundle: RequestHandler = async (req, res) => {
  const { name, description, price_cents, course_ids, starts_at, ends_at, is_active = true } = req.body;
  if (!String(name || "").trim() || !Number.isInteger(Number(price_cents)) || Number(price_cents) < 0 || !Array.isArray(course_ids) || course_ids.length < 2) return res.status(400).json({ success: false, error: "Name, a non-negative price, and at least two courses are required" });
  if (starts_at && ends_at && new Date(starts_at) >= new Date(ends_at)) return res.status(400).json({ success: false, error: "End date must be after the start date" });
  try {
    const bundle = await query("INSERT INTO bundle_deals (name, description, price_cents, starts_at, ends_at, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [String(name).trim(), description || null, Number(price_cents), starts_at || null, ends_at || null, Boolean(is_active)]);
    for (const courseId of [...new Set(course_ids.map(String))]) await query("INSERT INTO bundle_deal_courses (bundle_id, course_id) VALUES ($1,$2)", [bundle.rows[0].id, courseId]);
    res.status(201).json({ success: true, data: bundle.rows[0], message: "Bundle deal created" });
  } catch (error: any) { console.error("Error creating bundle:", error); res.status(error?.code === "23503" ? 400 : 500).json({ success: false, error: error?.code === "23503" ? "One or more courses do not exist" : "Failed to create bundle" }); }
};

export const deleteBundle: RequestHandler = async (req, res) => {
  try { const result = await query("DELETE FROM bundle_deals WHERE id = $1 RETURNING id", [req.params.id]); if (!result.rows.length) return res.status(404).json({ success: false, error: "Bundle not found" }); res.json({ success: true, data: result.rows[0] }); }
  catch (error) { console.error("Error deleting bundle:", error); res.status(500).json({ success: false, error: "Failed to delete bundle" }); }
};

export const updateBundle: RequestHandler = async (req, res) => {
  const { name, description, price_cents, course_ids, starts_at, ends_at, is_active } = req.body;
  if (starts_at && ends_at && new Date(starts_at) >= new Date(ends_at)) return res.status(400).json({ success: false, error: "End date must be after the start date" });
  try {
    const result = await query("UPDATE bundle_deals SET name = COALESCE($1, name), description = CASE WHEN $8 THEN $2 ELSE description END, price_cents = COALESCE($3, price_cents), starts_at = CASE WHEN $9 THEN $4 ELSE starts_at END, ends_at = CASE WHEN $10 THEN $5 ELSE ends_at END, is_active = COALESCE($6, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *", [name?.trim() || null, description || null, price_cents === undefined ? null : Number(price_cents), starts_at || null, ends_at || null, is_active === undefined ? null : Boolean(is_active), req.params.id, Object.prototype.hasOwnProperty.call(req.body, "description"), Object.prototype.hasOwnProperty.call(req.body, "starts_at"), Object.prototype.hasOwnProperty.call(req.body, "ends_at")]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: "Bundle not found" });
    if (Array.isArray(course_ids)) {
      await query("DELETE FROM bundle_deal_courses WHERE bundle_id = $1", [req.params.id]);
      for (const courseId of [...new Set(course_ids.map(String))]) await query("INSERT INTO bundle_deal_courses (bundle_id, course_id) VALUES ($1,$2)", [req.params.id, courseId]);
    }
    res.json({ success: true, data: result.rows[0], message: "Bundle updated" });
  } catch (error) { console.error("Error updating bundle:", error); res.status(500).json({ success: false, error: "Failed to update bundle" }); }
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
