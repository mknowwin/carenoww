import type { Request, Response, NextFunction } from "express";

/**
 * Wraps an async route handler so any thrown error or rejected promise is
 * forwarded to next(err) instead of crashing the process or requiring a
 * try/catch in every route. Generic on Req so callers can pass AuthRequest /
 * SuperAdminRequest and keep type inference on req.user / req.superadmin.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}
