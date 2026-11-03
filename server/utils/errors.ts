import type { Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function respondError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ZodError) return res.status(400).json({ success: false, error: error.issues.map(issue => `${issue.path.join(".") || "Request"}: ${issue.message}`).join("; ") });
  if (error instanceof HttpError) return res.status(error.status).json({ success: false, error: error.message });
  const code = (error as { code?: string })?.code;
  if (["23503", "23514", "22P02", "22001", "22007", "22008", "22003"].includes(code || "")) return res.status(400).json({ success: false, error: "One or more values are invalid or reference unavailable records." });
  if (code === "23505") return res.status(409).json({ success: false, error: "This record already exists or conflicts with another operation." });
  console.error(fallback, error);
  return res.status(500).json({ success: false, error: fallback });
}
