// ── Shared types between client and server ────────────────────────────────────

export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "pharmacist" | "pharmacy_admin" | "lab_tech" | "finance";
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
  timezone: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE_KEY"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "DB_ERROR"
  | "NETWORK_ERROR"; // frontend-only: fetch itself failed, no HTTP response

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  requestId: string;
  error: ApiErrorBody;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ── Tenant (Hospital) ─────────────────────────────────────────────────────────
export interface TaxConfig {
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxInclusivePricing: boolean;
}

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
    gstNo?: string;
    invoicePrefix?: string;
    paymentMethods?: string[];
    taxConfig?: TaxConfig;
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
export interface AppointmentVitals {
  bp?: string;
  pulse?: string;
  temp?: string;
  spo2?: string;
  weight?: string;
  height?: string;
}

export interface AppointmentSoap {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

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
  referringDoctor?: string;
  vitals?: AppointmentVitals;
  soap?: AppointmentSoap;
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
export interface OrderItem {
  _id?: string;
  drugId?: string;
  drugName: string;
  batchId?: string;
  batchNo: string;
  quantity: number;
  unit: string;
  mrpPerUnit: number;
  totalAmount: number;
}

export interface PharmacyOrder {
  _id?: string;
  rxId?: string;
  patientId: string;
  patientName: string;
  drug: string;
  qty: number;
  unit: string;
  items?: OrderItem[];
  status: "Pending" | "Verified" | "Dispensed";
  type: "OPD" | "IPD" | "ICU";
  rxSource?: "Digital" | "Paper" | "OTC";
  paperRxNote?: string;
  doctor: string;
  time: string;
  prescriptionId?: string;
  dispensedBy?: string;
  dispensedAt?: string;
  notes?: string;
}

export interface DrugBatch {
  _id?: string;
  drugId: string;
  batchNo: string;
  lotNo?: string;
  supplierName?: string;
  manufacturingDate?: string;
  expiryDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  purchasePricePerUnit: number;
  mrpPerUnit: number;
  status: "Active" | "Exhausted" | "Expired" | "Quarantine";
}

export interface DrugInventory {
  _id?: string;
  name: string;
  stock: number;
  unit: string;
  reorderLevel: number;
  expiryDate?: string;
  status: "OK" | "Low" | "Critical";
  supplier: string;
  category?: string;
  hsnCode?: string;
  mrpPerUnit?: number;
  purchasePricePerUnit?: number;
  isBatchTracked?: boolean;
  isActive?: boolean;
}

export interface GRNItem {
  _id?: string;
  drugId: string;
  drugName: string;
  batchNo: string;
  expiryDate: string;
  quantityReceived: number;
  purchasePricePerUnit: number;
  mrpPerUnit: number;
  totalCost: number;
}

export interface GRN {
  _id?: string;
  grnId?: string;
  supplierName: string;
  invoiceNo?: string;
  invoiceDate?: string;
  receivedDate?: string;
  receivedBy?: string;
  items: GRNItem[];
  totalValue: number;
  status: "Draft" | "Received" | "Cancelled";
  notes?: string;
}

export interface StockAdjustment {
  _id?: string;
  adjustmentId?: string;
  drugId: string;
  drugName: string;
  batchId?: string;
  adjustmentType: "Damage" | "Expiry-Writeoff" | "Theft" | "Count-Correction" | "Return-to-Supplier" | "Opening-Stock";
  quantityBefore: number;
  quantityAdjusted: number;
  quantityAfter: number;
  reason: string;
  adjustedBy?: string;
  createdAt?: string;
}

export interface InventoryAuditLogEntry {
  _id?: string;
  drugId: string;
  action: "Created" | "Updated" | "Deactivated" | "Reactivated";
  changes: Array<{ field: string; oldValue: any; newValue: any }>;
  performedBy: string;
  notes?: string;
  createdAt?: string;
}

// Merged per-drug timeline entry returned by GET /pharmacy/inventory/:id/history
export type DrugHistoryEntry =
  | ({ type: "GRN"; date: string } & Pick<GRNItem, "batchNo" | "quantityReceived" | "purchasePricePerUnit" | "mrpPerUnit"> & { grnId?: string; grnStatus: GRN["status"]; receivedBy?: string })
  | ({ type: "Adjustment"; date: string } & Pick<StockAdjustment, "adjustmentId" | "adjustmentType" | "quantityBefore" | "quantityAdjusted" | "quantityAfter" | "reason" | "adjustedBy">)
  | ({ type: "Edit"; date: string } & Pick<InventoryAuditLogEntry, "action" | "changes" | "performedBy">);

// ── Billing ───────────────────────────────────────────────────────────────────
export interface BillItem {
  _id?: string;
  description: string;
  category: "Consultation" | "Lab" | "Pharmacy" | "Procedure" | "Room" | "Other";
  quantity: number;
  unitPrice: number;
  total: number;
  hsnCode?: string;
  taxRate?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  taxableAmount?: number;
}

export interface PaymentEntry {
  _id?: string;
  paymentId?: string;
  amount: number;
  paymentMode: "Cash" | "Card" | "UPI" | "Insurance" | "Online" | "Advance-Adjustment";
  payer: string;
  transactionRef?: string;
  receivedBy?: string;
  receivedById?: string;
  notes?: string;
  paidAt?: string;
}

export interface AdvanceEntry {
  _id?: string;
  amount: number;
  receivedDate?: string;
  receivedBy?: string;
  receivedById?: string;
  mode: "Cash" | "Card" | "UPI" | "Insurance" | "Online";
  transactionRef?: string;
}

export interface InsuranceClaim {
  tpaName?: string;
  policyNo?: string;
  memberNo?: string;
  claimNo?: string;
  preAuthNo?: string;
  preAuthStatus?: "Pending" | "Approved" | "Rejected" | "PartialApproval";
  preAuthAmount?: number;
  claimStatus?: "Not-Filed" | "Filed" | "Under-Review" | "Approved" | "Rejected" | "Settled" | "Escalated";
  claimAmount?: number;
  settledAmount?: number;
  submittedDate?: string;
  settledDate?: string;
  rejectionReason?: string;
}

export interface BillingRecord {
  _id?: string;
  billId?: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  admissionId?: string;
  date: string;
  items?: BillItem[];
  amount: number;
  paid: number;
  balance: number;
  discount?: number;
  discountType?: "Flat" | "Percent";
  discountPercent?: number;
  totalAdvance?: number;
  advances?: AdvanceEntry[];
  payments?: PaymentEntry[];
  status: "Draft" | "Paid" | "Partial" | "Pending" | "Claimed";
  payer: string;
  paymentMode?: "Cash" | "Card" | "UPI" | "Insurance" | "Online";
  type: string;
  notes?: string;
  createdBy?: string;
  createdById?: string;
  isLocked?: boolean;
  insurance?: InsuranceClaim;
  totalCgst?: number;
  totalSgst?: number;
  totalIgst?: number;
  totalTax?: number;
  taxableAmount?: number;
}

// ── Service Rate Master ───────────────────────────────────────────────────────
export interface ServiceRate {
  _id?: string;
  category: "Consultation" | "Lab" | "Pharmacy" | "Procedure" | "Room" | "Other";
  name: string;
  defaultRate: number;
  unit?: string;
  hsnCode?: string;
  taxRate?: number;
  isActive?: boolean;
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
