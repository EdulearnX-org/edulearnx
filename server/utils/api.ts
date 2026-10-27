import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Success",
  status = 200,
) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

export function sendError(
  res: Response,
  error: string,
  status = 500,
) {
  return res.status(status).json({
    success: false,
    error,
  });
}
