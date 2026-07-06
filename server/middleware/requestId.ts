import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const inbound = req.headers["x-request-id"];
  const id = (typeof inbound === "string" && inbound) || randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
