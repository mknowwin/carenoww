import type { ErrorCode } from "../../shared/types.js";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST:       400,
  UNAUTHORIZED:       401,
  INVALID_TOKEN:      401,
  TOKEN_EXPIRED:      401,
  FORBIDDEN:          403,
  NOT_FOUND:          404,
  ROUTE_NOT_FOUND:    404,
  CONFLICT:           409,
  DUPLICATE_KEY:      409,
  RATE_LIMITED:       429,
  INTERNAL_ERROR:     500,
  DB_ERROR:           500,
  NETWORK_ERROR:      0, // frontend-only, no HTTP status
};

/** Safe, user-facing default messages — used whenever the real error message must not be leaked to the client. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Please correct the highlighted fields.",
  BAD_REQUEST:       "The request could not be understood.",
  UNAUTHORIZED:       "Please log in to continue.",
  INVALID_TOKEN:      "Your session is invalid. Please log in again.",
  TOKEN_EXPIRED:      "Your session has expired. Please log in again.",
  FORBIDDEN:          "You don't have permission to do that.",
  NOT_FOUND:          "The requested resource was not found.",
  ROUTE_NOT_FOUND:    "The requested endpoint does not exist.",
  CONFLICT:           "This conflicts with existing data.",
  DUPLICATE_KEY:      "A record with these details already exists.",
  RATE_LIMITED:       "Too many requests. Please try again later.",
  INTERNAL_ERROR:     "Something went wrong. Please contact support.",
  DB_ERROR:           "Something went wrong. Please contact support.",
  NETWORK_ERROR:      "Unable to reach the server. Check your connection.",
};
