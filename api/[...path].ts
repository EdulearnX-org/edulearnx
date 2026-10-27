import type { Request, Response } from "express";
import { createServer, initializeServer } from "../server/index.js";

const app = createServer();

export default async function handler(req: Request, res: Response) {
  try {
    await initializeServer();
  } catch (error) {
    console.error("API initialization failed", error);
    res.status(503).json({ success: false, error: "Service is not ready" });
    return;
  }
  return app(req, res);
}
