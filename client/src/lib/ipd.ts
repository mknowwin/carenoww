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

// A round is "due" when the last one (or the admission, if none) is older than this
export const ROUND_DUE_HOURS = 6;

export function roundDue(admission: { admissionDate: string; rounds?: { roundedAt: string }[] }, now = Date.now()): boolean {
  const last = admission.rounds?.[admission.rounds.length - 1]?.roundedAt ?? admission.admissionDate;
  return now - new Date(last).getTime() > ROUND_DUE_HOURS * 3600000;
}

// ── Vitals flags ──────────────────────────────────────────────────────────────
// General adult thresholds used only to highlight values for review — not a
// clinical decision rule, and not adjusted for age or condition.
export type VitalLevel = "warning" | "critical";
export interface VitalFlag { vital: string; value: string; level: VitalLevel; label: string }

export function parseBp(bp?: string): { sys: number; dia: number } | null {
  const m = String(bp ?? "").match(/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/);
  return m ? { sys: +m[1], dia: +m[2] } : null;
}

export function vitalFlags(r: { bp?: string; pulse?: number; temp?: number; spo2?: number; respRate?: number }): VitalFlag[] {
  const flags: VitalFlag[] = [];
  const add = (vital: string, value: string, level: VitalLevel, label: string) => flags.push({ vital, value, level, label });
  const bp = parseBp(r.bp);
  if (bp) {
    if (bp.sys < 90)        add("BP", r.bp!, "critical", "Low BP");
    else if (bp.sys >= 180 || bp.dia >= 110) add("BP", r.bp!, "critical", "Very high BP");
    else if (bp.sys >= 140 || bp.dia >= 90)  add("BP", r.bp!, "warning", "High BP");
  }
  if (r.pulse) {
    if (r.pulse < 50 || r.pulse > 120)       add("Pulse", String(r.pulse), "critical", r.pulse < 50 ? "Bradycardia" : "Tachycardia");
    else if (r.pulse < 60 || r.pulse > 100)  add("Pulse", String(r.pulse), "warning", r.pulse < 60 ? "Low pulse" : "High pulse");
  }
  if (r.temp) {
    if (r.temp >= 103 || r.temp < 95)        add("Temp", `${r.temp}°F`, "critical", r.temp < 95 ? "Hypothermia" : "High fever");
    else if (r.temp >= 100.4)                add("Temp", `${r.temp}°F`, "warning", "Fever");
  }
  if (r.spo2) {
    if (r.spo2 < 90)                         add("SpO₂", `${r.spo2}%`, "critical", "Low SpO₂");
    else if (r.spo2 < 95)                    add("SpO₂", `${r.spo2}%`, "warning", "SpO₂ below 95");
  }
  if (r.respRate) {
    if (r.respRate < 10 || r.respRate > 30)  add("RR", String(r.respRate), "critical", r.respRate < 10 ? "Low resp. rate" : "High resp. rate");
    else if (r.respRate > 20)                add("RR", String(r.respRate), "warning", "Raised resp. rate");
  }
  return flags;
}

export const IPD_ROLES = {
  admit:     ["admin", "doctor", "nurse", "receptionist"],
  round:     ["admin", "doctor", "nurse"],
  transfer:  ["admin", "doctor", "nurse"],
  edit:      ["admin", "doctor", "nurse"],
  discharge: ["admin", "doctor"],
  bedStatus: ["admin", "doctor", "nurse"],
  note:      ["admin", "doctor"],          // progress notes
  orders:    ["admin", "doctor"],          // IPD prescriptions / lab orders from the chart
} as const;

export const canDo = (role: string | undefined, action: keyof typeof IPD_ROLES) =>
  !!role && (IPD_ROLES[action] as readonly string[]).includes(role);
