// Shared IPD constants and helpers (IPD page, Admit / Transfer / Edit dialogs,
// Settings → Wards & Beds). Wards and beds themselves come from /api/wards.

export const DEPTS = ["General Medicine", "Cardiology", "Orthopedics", "Neurology", "Obstetrics", "Pediatrics", "Emergency"];

// Mirrors server/models/Ward.ts WARD_TYPES
export const WARD_TYPES = ["General", "ICU", "Private", "Semi-Private", "Obs/Gyn", "Pediatric", "Other"] as const;

const WARD_TYPE_COLORS: Record<string, string> = {
  ICU:            "bg-red-50 border-red-200 text-red-700",
  General:        "bg-blue-50 border-blue-200 text-blue-700",
  Private:        "bg-purple-50 border-purple-200 text-purple-700",
  "Semi-Private": "bg-teal-50 border-teal-200 text-teal-700",
  "Obs/Gyn":      "bg-pink-50 border-pink-200 text-pink-700",
  Pediatric:      "bg-amber-50 border-amber-200 text-amber-700",
};
export const wardTypeColor = (type?: string) => WARD_TYPE_COLORS[type ?? ""] ?? "bg-gray-50 border-gray-200 text-gray-700";

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
  bedStatus: ["admin", "doctor", "nurse"],
} as const;

export const canDo = (role: string | undefined, action: keyof typeof IPD_ROLES) =>
  !!role && (IPD_ROLES[action] as readonly string[]).includes(role);
