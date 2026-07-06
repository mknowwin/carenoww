// Matched as a substring of the (lowercased) key, not an exact match — real payloads
// use variants like currentPassword/newPassword/oldPassword, refreshToken/accessToken,
// apiKey, etc., not just the bare field name.
const SENSITIVE_KEY_PATTERN = /password|token|otp|apikey|secret|cardnumber/i;

const REDACTED = "***REDACTED***";

/**
 * Recursively replaces the value of any sensitive-looking key with a redacted
 * placeholder before the object is logged or persisted. Never mutates the input.
 */
export function maskSensitiveData(input: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (input === null || typeof input !== "object") return input;
  if (input instanceof Date) return input;
  if (seen.has(input as object)) return input;
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => maskSensitiveData(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = maskSensitiveData(value, seen);
    }
  }
  return result;
}
