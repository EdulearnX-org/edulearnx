import type { RequestHandler } from "express";
import { z } from "zod";
import { query } from "../db/connection.js";
import { sendError, sendSuccess } from "../utils/api.js";

const paymentSettingsSchema = z.object({
  bank_name: z.string().max(255),
  account_name: z.string().max(255),
  account_number: z.string().max(255),
  iban: z.string().max(255),
  routing_code: z.string().max(255),
  instructions: z.string().max(5000),
});

const selectSettings = `
  SELECT bank_name, account_name, account_number, iban, routing_code, instructions, updated_at
  FROM payment_settings
  WHERE id = 1
`;

export const getPaymentSettings: RequestHandler = async (_req, res) => {
  try {
    const result = await query(selectSettings);
    return sendSuccess(res, result.rows[0] ?? null);
  } catch (error) {
    console.error("Unable to fetch payment settings:", error);
    return sendError(res, "Unable to fetch payment settings", 500);
  }
};

export const updatePaymentSettings: RequestHandler = async (req, res) => {
  const parsed = paymentSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "Invalid bank-transfer settings", 400);
  }

  try {
    const result = await query(
      `UPDATE payment_settings
       SET bank_name = $1,
           account_name = $2,
           account_number = $3,
           iban = $4,
           routing_code = $5,
           instructions = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING bank_name, account_name, account_number, iban, routing_code, instructions, updated_at`,
      [
        parsed.data.bank_name.trim(),
        parsed.data.account_name.trim(),
        parsed.data.account_number.trim(),
        parsed.data.iban.trim(),
        parsed.data.routing_code.trim(),
        parsed.data.instructions.trim(),
      ],
    );
    return sendSuccess(res, result.rows[0], "Payment settings updated");
  } catch (error) {
    console.error("Unable to update payment settings:", error);
    return sendError(res, "Unable to update payment settings", 500);
  }
};
