import type { ErrorCode } from "../../shared/types.js";
import { ERROR_STATUS, ERROR_MESSAGES } from "./errorCodes.js";

export interface AppErrorOptions {
  message?: string;
  statusCode?: number;
  details?: unknown;
  isOperational?: boolean;
}

/**
 * Application error carrying an HTTP status, a stable machine-readable code, and
 * an isOperational flag that tells errorHandler.ts whether `.message` is safe to
 * show to the client (true) or must be replaced with the generic ERROR_MESSAGES
 * copy (false — unexpected/programmer error).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(code: ErrorCode, opts: AppErrorOptions = {}) {
    super(opts.message ?? ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.statusCode = opts.statusCode ?? ERROR_STATUS[code];
    this.isOperational = opts.isOperational ?? true;
    this.details = opts.details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message?: string, details?: unknown) {
    return new AppError("BAD_REQUEST", { message, details });
  }

  static validation(message?: string, details?: unknown) {
    return new AppError("VALIDATION_ERROR", { message, details });
  }

  static unauthorized(message?: string) {
    return new AppError("UNAUTHORIZED", { message });
  }

  static forbidden(message?: string) {
    return new AppError("FORBIDDEN", { message });
  }

  static notFound(message?: string) {
    return new AppError("NOT_FOUND", { message });
  }

  static conflict(message?: string, details?: unknown) {
    return new AppError("CONFLICT", { message, details });
  }

  static internal(message?: string) {
    return new AppError("INTERNAL_ERROR", { message, isOperational: false });
  }

  /** Normalizes any thrown value (AppError, Mongoose errors, JSON parse errors, or unknowns) into an AppError. */
  static fromUnknown(err: unknown): AppError {
    if (err instanceof AppError) return err;

    if (err instanceof Error) {
      const anyErr = err as any;

      let normalized: AppError;

      // Mongoose validation error (schema-level `required`, `enum`, etc.)
      if (anyErr.name === "ValidationError" && anyErr.errors) {
        const details = Object.entries(anyErr.errors as Record<string, any>).map(([field, e]) => ({
          field,
          message: (e as any).message,
        }));
        normalized = new AppError("VALIDATION_ERROR", { details });
      } else if (anyErr.name === "CastError") {
        // Mongoose cast error — malformed ObjectId in a route param
        normalized = new AppError("BAD_REQUEST", { message: "Invalid id format" });
      } else if (anyErr.code === 11000) {
        // MongoDB duplicate key error
        const field = anyErr.keyValue ? Object.keys(anyErr.keyValue)[0] : undefined;
        normalized = new AppError("DUPLICATE_KEY", {
          message: field ? `A record with this ${field} already exists.` : undefined,
        });
      } else if (anyErr.type === "entity.parse.failed") {
        // body-parser JSON parse failure
        normalized = new AppError("BAD_REQUEST", { message: "Malformed JSON body" });
      } else {
        normalized = new AppError("INTERNAL_ERROR", {
          message: err.message,
          isOperational: false,
        });
      }

      // Preserve the original stack trace (points at the real failure site) rather
      // than the one captured at AppError construction time, so logs stay useful.
      normalized.stack = err.stack;
      return normalized;
    }

    return new AppError("INTERNAL_ERROR", { isOperational: false });
  }
}
