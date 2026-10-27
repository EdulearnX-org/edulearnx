import type { RequestHandler } from "express";
import { z } from "zod";
import { query } from "../db/connection.js";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
});
const attempts = new Map<string, { count: number; expires: number }>();

export const submitContactMessage: RequestHandler = async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Enter a name, valid email, subject, and message (at most 10,000 characters)." });
    return;
  }
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = req.ip || "unknown";
  const attempt = attempts.get(key) || { count: 0, expires: now + 15 * 60_000 };
  if (attempt.count >= 5) {
    res.status(429).json({ success: false, error: "Please wait before sending another message." });
    return;
  }
  attempt.count += 1;
  attempts.set(key, attempt);
  try {
    const { name, email, subject, message } = parsed.data;
    await query("INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)", [name, email, subject, message]);
    res.status(201).json({ success: true, message: "Your message has been received." });
  } catch (error) {
    console.error("Unable to save contact message", error);
    res.status(503).json({ success: false, error: "Unable to send your message. Please try again or email team@edulearnx.org." });
  }
};
