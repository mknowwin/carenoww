// Mirrors server/models/Tenant.ts MODULE_KEYS — kept in sync manually since
// client code doesn't import server models.
export const MODULE_KEYS = [
  "dashboard", "patients", "appointments", "opd", "ipd",
  "lab", "pharmacy", "billing", "analytics",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  patients: "Patients",
  appointments: "Appointments",
  opd: "OPD",
  ipd: "IPD",
  lab: "Lab",
  pharmacy: "Pharmacy",
  billing: "Billing",
  analytics: "Analytics",
};
