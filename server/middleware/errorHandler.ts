import type { Request, Response, NextFunction } from "express";
import type { ApiErrorResponse } from "../../shared/types.js";
import { AppError } from "../lib/AppError.js";
import { ERROR_MESSAGES } from "../lib/errorCodes.js";
import { logAndPersistError } from "../lib/logger.js";
import type { AuthRequest } from "./auth.js";
import type { SuperAdminRequest } from "./superadmin.js";

/** Must be registered last (after every router) — Express identifies error middleware by its 4-arg signature. */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  const appErr = AppError.fromUnknown(err);
  const authReq = req as AuthRequest & SuperAdminRequest;

  const tenantId = authReq.user?.tenantId;
  const userId = authReq.user?.id ?? authReq.superadmin?.email;
  const module = req.originalUrl.split("/")[2] ?? "unknown";

  const clientMessage = appErr.isOperational ? appErr.message : ERROR_MESSAGES[appErr.code];
  const envelope: ApiErrorResponse = {
    success: false,
    requestId: req.requestId,
    error: {
      code: appErr.code,
      message: clientMessage,
      details: appErr.isOperational ? appErr.details : undefined,
    },
  };

  logAndPersistError({
    tenantId,
    requestId: req.requestId,
    userId,
    module,
    api: req.originalUrl,
    method: req.method,
    statusCode: appErr.statusCode,
    errorCode: appErr.code,
    message: appErr.message,
    stack: appErr.stack,
    payload: req.body,
    params: req.params,
    query: req.query,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    environment: process.env.NODE_ENV ?? "development",
  });

  res.status(appErr.statusCode || 500).json(envelope);
}
