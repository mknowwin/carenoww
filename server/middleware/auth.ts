import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../lib/AppError.js";

const JWT_SECRET = process.env.JWT_SECRET || "carenoww_dev_secret_change_in_prod";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    email: string;
    role: string;
    name: string;
    timezone: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Unauthorized"));
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role === "superadmin") {
      return next(AppError.forbidden("Use superadmin endpoints"));
    }
    req.user = payload;
    next();
  } catch {
    return next(new AppError("INVALID_TOKEN", { message: "Invalid or expired token" }));
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized("Unauthorized"));
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden("Insufficient permissions"));
    }
    next();
  };
}
