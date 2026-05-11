import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const SUPERADMIN_JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || "carenoww_superadmin_secret_change_in_prod";

export interface SuperAdminRequest extends Request {
  superadmin?: { email: string; role: "superadmin" };
}

export function superadminMiddleware(req: SuperAdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SUPERADMIN_JWT_SECRET) as any;
    if (payload.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }
    req.superadmin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired superadmin token" });
  }
}
