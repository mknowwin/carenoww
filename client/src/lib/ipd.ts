// Shared IPD constants and helpers (IPD page, Admit / Transfer / Edit dialogs).
// Wards are a fixed list until the per-tenant ward & bed master lands.

export const WARDS = ["General Ward", "ICU", "Private Ward", "Semi-Private", "Obs/Gyn", "Pediatric"];
export const DEPTS = ["General Medicine", "Cardiology", "Orthopedics", "Neurology", "Obstetrics", "Pediatrics", "Emergency"];

const WARD_COLORS: Record<string, string> = {
  ICU:            "bg-red-50 border-red-200 text-red-700",
  "General Ward": "bg-blue-50 border-blue-200 text-blue-700",
  "Private Ward": "bg-purple-50 border-purple-200 text-purple-700",
  "Semi-Private": "bg-teal-50 border-teal-200 text-teal-700",
  "Obs/Gyn":      "bg-pink-50 border-pink-200 text-pink-700",
  Pediatric:      "bg-amber-50 border-amber-200 text-amber-700",
};
export const wardColor = (ward: string) => WARD_COLORS[ward] ?? "bg-gray-50 border-gray-200 text-gray-700";

// Same as the server's normalizeBed — "gw 05" → "GW05", "gw-05" → "GW-05"
export const normalizeBed = (bed: string) => bed.trim().toUpperCase().replace(/\s+/g, "");

// Hospital day of stay: admitted today = Day 1, counted in calendar days in the tenant timezone
export function stayDay(admissionDate: string | Date, tz: string, until: string | Date = new Date()): number {
  const day = (d: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d));
  const diff = (Date.parse(day(until)) - Date.parse(day(admissionDate))) / 86400000;
  return Math.max(0, Math.round(diff)) + 1;
}

export const IPD_ROLES = {
  admit:     ["admin", "doctor", "nurse", "receptionist"],
  round:     ["admin", "doctor", "nurse"],
  transfer:  ["admin", "doctor", "nurse"],
  edit:      ["admin", "doctor", "nurse"],
  discharge: ["admin", "doctor"],
} as const;

export const canDo = (role: string | undefined, action: keyof typeof IPD_ROLES) =>
  !!role && (IPD_ROLES[action] as readonly string[]).includes(role);
