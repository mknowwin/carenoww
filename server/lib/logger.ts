import ErrorLog from "../models/ErrorLog.js";
import { maskSensitiveData } from "./maskSensitiveData.js";

type LogLevel = "fatal" | "error" | "warn" | "info";

function writeConsole(level: LogLevel, entry: Record<string, unknown>) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...entry }));
}

export const logger = {
  fatal: (entry: Record<string, unknown>) => writeConsole("fatal", entry),
  error: (entry: Record<string, unknown>) => writeConsole("error", entry),
  warn:  (entry: Record<string, unknown>) => writeConsole("warn", entry),
  info:  (entry: Record<string, unknown>) => writeConsole("info", entry),
};

export interface ErrorLogEntry {
  tenantId?: string;
  requestId: string;
  userId?: string;
  module: string;
  api: string;
  method: string;
  statusCode: number;
  errorCode: string;
  message: string;
  stack?: string;
  payload?: unknown;
  params?: unknown;
  query?: unknown;
  ipAddress?: string;
  userAgent?: string;
  environment: string;
}

/** Persists an error entry to MongoDB. Never throws — a DB write failure here must not mask the original error response. */
async function logErrorToDb(entry: ErrorLogEntry): Promise<void> {
  try {
    await ErrorLog.create({
      ...entry,
      payload: maskSensitiveData(entry.payload),
      params: maskSensitiveData(entry.params),
      query: maskSensitiveData(entry.query),
    });
  } catch (err) {
    logger.error({ message: "Failed to persist ErrorLog", requestId: entry.requestId, cause: err instanceof Error ? err.message : err });
  }
}

/** Logs to console (always, synchronously) and fires off a persisted ErrorLog write (best-effort). */
export function logAndPersistError(entry: ErrorLogEntry): void {
  const level: LogLevel = entry.statusCode >= 500 ? "error" : "warn";
  logger[level]({
    requestId: entry.requestId,
    tenantId: entry.tenantId,
    userId: entry.userId,
    module: entry.module,
    api: entry.api,
    method: entry.method,
    statusCode: entry.statusCode,
    errorCode: entry.errorCode,
    message: entry.message,
    stack: entry.stack,
  });
  void logErrorToDb(entry);
}
