// ── Shared types between client and server ────────────────────────────────────

export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "pharmacist" | "lab_tech" | "finance";
export type TenantPlan = "trial" | "starter" | "professional" | "enterprise";
export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  organization: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  error: string;
  message?: string;
}

// ── Tenant (Hospital) ─────────────────────────────────────────────────────────
export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  trialEndsAt: string;
  contact: {
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
  };
  settings: {
    maxUsers: number;
    maxPatients: number;
    modules: string[];
  };
  subscription: {
    startedAt: string;
    expiresAt: string;
    amount: number;
  };
  userCount?: number;
  patientCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ── Patient ───────────────────────────────────────────────────────────────────
export interface Patient {
  _id?: string;
  id?: string;               // alias used by UI
  uhid: string;
  tenantId?: string;
  name: string;
  age: number;
  gender: "M" | "F" | "O";
  bloodGroup: string;
  phone: string;
  address: string;
  department: string;
  status: "OPD" | "IPD" | "ICU" | "Discharged";
  admittedOn: string;
  doctor: string;
  diagnosis: string;
  insurance: string;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  isActive?: boolean;
}

// ── Appointment ───────────────────────────────────────────────────────────────
export interface Appointment {
  _id?: string;
  id?: string;               // alias used by UI
  aptId?: string;
  patientId: string;
  patientName: string;
  doctor: string;
  department: string;
  date: string;
  time: string;
  type: "New" | "Follow-up" | "Emergency" | "Teleconsult" | "Home Visit";
  status: "Scheduled" | "Confirmed" | "Waiting" | "In Consult" | "Completed" | "Cancelled";
  token: string;
  notes?: string;
}

// ── Lab Order ─────────────────────────────────────────────────────────────────
export interface LabOrder {
  _id?: string;
  labId?: string;
  patientId: string;
  patientName: string;
  test: string;
  ordered: string;
  status: "Pending" | "Collected" | "Processing" | "Completed" | "Scheduled";
  result: string | null;
  priority: "Routine" | "Urgent" | "STAT";
  doctor: string;
}

// ── Pharmacy ──────────────────────────────────────────────────────────────────
export interface PharmacyOrder {
  _id?: string;
  rxId?: string;
  patientId: string;
  patientName: string;
  drug: string;
  qty: number;
  unit: string;
  status: "Pending" | "Verified" | "Dispensed";
  type: "OPD" | "IPD" | "ICU";
  doctor: string;
  time: string;
}

export interface DrugInventory {
  _id?: string;
  name: string;
  stock: number;
  unit: string;
  reorderLevel: number;
  expiryDate: string;
  status: "OK" | "Low" | "Critical";
  supplier: string;
}

// ── Billing ───────────────────────────────────────────────────────────────────
export interface BillingRecord {
  _id?: string;
  billId?: string;
  patientId: string;
  patientName: string;
  date: string;
  amount: number;
  paid: number;
  balance: number;
  status: "Paid" | "Partial" | "Pending" | "Claimed";
  payer: string;
  type: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface HospitalMetrics {
  totalPatients: number;
  opdToday: number;
  ipdCurrent: number;
  icuCurrent: number;
  bedOccupancyRate: number;
  avgLOS: number;
  revenueToday: number;
  revenueMonth: number;
  pendingClaims: number;
  appointmentsToday: number;
  surgeriesThisWeek: number;
  criticalAlerts: number;
}

export interface BedOccupancy {
  ward: string;
  total: number;
  occupied: number;
  available: number;
}

export interface AIAlert {
  id: string | number;
  type: "critical" | "warning" | "info";
  module: string;
  patient: string | null;
  message: string;
  time: string;
  action: string;
}
