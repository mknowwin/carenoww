/**
 * Timezone-aware date helpers for the HMS server.
 * All use Intl.DateTimeFormat (built into Node 16+) — no extra packages needed.
 */

/** Returns "YYYY-MM-DD" in the given IANA timezone. */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Returns "YYYY-MM" in the given IANA timezone. */
export function currentMonthInTz(tz: string): string {
  return todayInTz(tz).slice(0, 7);
}

/** UTC Date for start-of-day (00:00:00.000) in the given IANA timezone. */
export function startOfDayUtc(dateStr: string, tz: string): Date {
  const offset = _tzOffset(tz, dateStr);
  return new Date(`${dateStr}T00:00:00${offset}`);
}

/** UTC Date for end-of-day (23:59:59.999) in the given IANA timezone. */
export function endOfDayUtc(dateStr: string, tz: string): Date {
  return new Date(startOfDayUtc(dateStr, tz).getTime() + 86_400_000 - 1);
}

/** Derive ISO offset string (e.g. "+05:30") for a timezone on a given date string. */
function _tzOffset(tz: string, dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(noonUtc);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const m = raw.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return "+00:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${(m[3] ?? "0").padStart(2, "0")}`;
}
