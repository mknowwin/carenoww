import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../lib/AppError.js";
import Tenant from "../models/Tenant.js";

const JWT_SECRET = process.env.JWT_SECRET || "carenoww_dev_secret_change_in_prod";

// Suspending/cancelling a tenant must also lock out tokens issued before it, so every
// request checks the tenant's status. Cached briefly to avoid a DB read per request;
// superadmin status changes call forgetTenantStatus() so they apply at once here
// (other instances pick them up within the TTL).
const TENANT_STATUS_TTL_MS = 30_000;
const tenantStatusCache = new Map<string, { active: boolean; at: number }>();

export function forgetTenantStatus(tenantId: string) {
  tenantStatusCache.delete(String(tenantId));
}

async function isTenantActive(tenantId: string): Promise<boolean> {
  const cached = tenantStatusCache.get(tenantId);
  if (cached && Date.now() - cached.at < TENANT_STATUS_TTL_MS) return cached.active;
  const tenant = await Tenant.findById(tenantId).select("status").lean();
  const active = !!tenant && tenant.status !== "suspended" && tenant.status !== "cancelled";
  tenantStatusCache.set(tenantId, { active, at: Date.now() });
  return active;
}

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

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Unauthorized"));
  }
  const token = authHeader.slice(7);
  let payload: any;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return next(new AppError("INVALID_TOKEN", { message: "Invalid or expired token" }));
  }
  if (payload.role === "superadmin") {
    return next(AppError.forbidden("Use superadmin endpoints"));
  }
  try {
    // 401 (not 403) so the client signs the user out, same message as login
    if (!(await isTenantActive(payload.tenantId))) {
      return next(AppError.unauthorized("Account suspended. Contact your administrator."));
    }
  } catch (err) {
    return next(err);
  }
  req.user = payload;
  next();
}

// Rate-limit key: the verified user id, so each user gets their own budget instead of
// a whole hospital (or every hospital behind a proxy) sharing one IP's. Falls back to
// the IP for unauthenticated or invalid tokens — a forged token can't pick a key.
export function rateLimitKey(req: Request): string {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as any;
      if (payload?.id) return `user:${payload.id}`;
    } catch { /* fall through to IP */ }
  }
  return `ip:${req.ip}`;
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
