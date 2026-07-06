import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/AppError.js";

/** Mounted at app.use("/api", notFoundHandler) — only catches /api/* paths that hit no router. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError("ROUTE_NOT_FOUND", { message: `Route ${req.method} ${req.originalUrl} not found` }));
}
