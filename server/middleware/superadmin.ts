import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../lib/AppError.js";

const SUPERADMIN_JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || "carenoww_superadmin_secret_change_in_prod";

export interface SuperAdminRequest extends Request {
  superadmin?: { email: string; role: "superadmin" };
}

export function superadminMiddleware(req: SuperAdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Unauthorized"));
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SUPERADMIN_JWT_SECRET) as any;
    if (payload.role !== "superadmin") {
      return next(AppError.forbidden("Superadmin access required"));
    }
    req.superadmin = payload;
    next();
  } catch {
    return next(new AppError("INVALID_TOKEN", { message: "Invalid or expired superadmin token" }));
  }
}
