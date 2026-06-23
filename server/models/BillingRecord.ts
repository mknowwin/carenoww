import mongoose, { Schema, Document } from "mongoose";

export interface IBillItem {
  description: string;
  category: "Consultation" | "Lab" | "Pharmacy" | "Procedure" | "Diagnosis" | "Room" | "Other";
  quantity: number;
  unitPrice: number;
  total: number;
  hsnCode?: string;
  taxRate?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  taxableAmount?: number;
  batchNo?: string;
  expiryDate?: Date;
  drugId?: string;
}

export interface IPaymentEntry {
  paymentId: string;
  amount: number;
  paymentMode: "Cash" | "Card" | "UPI" | "Insurance" | "Online" | "Advance-Adjustment";
  payer: string;
  transactionRef?: string;
  receivedBy: string;
  notes?: string;
  paidAt: Date;
}

export interface IAdvanceEntry {
  amount: number;
  receivedDate?: Date;
  receivedBy?: string;
  mode: "Cash" | "Card" | "UPI" | "Insurance" | "Online";
  transactionRef?: string;
}

export interface IInsuranceClaim {
  tpaName?: string;
  policyNo?: string;
  memberNo?: string;
  claimNo?: string;
  preAuthNo?: string;
  preAuthStatus?: "Pending" | "Approved" | "Rejected" | "PartialApproval";
  preAuthAmount?: number;
  claimStatus: "Not-Filed" | "Filed" | "Under-Review" | "Approved" | "Rejected" | "Settled" | "Escalated";
  claimAmount?: number;
  settledAmount?: number;
  submittedDate?: Date;
  settledDate?: Date;
  rejectionReason?: string;
}

export interface IBillingRecord extends Document {
  tenantId: mongoose.Types.ObjectId;
  billId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  admissionId?: string;
  date: Date;
  items: IBillItem[];
  amount: number;
  paid: number;
  balance: number;
  discount: number;
  discountType: "Flat" | "Percent";
  discountPercent: number;
  totalAdvance: number;
  advances: IAdvanceEntry[];
  payments: IPaymentEntry[];
  status: "Paid" | "Partial" | "Pending" | "Claimed";
  payer: string;
  paymentMode: "Cash" | "Card" | "UPI" | "Insurance" | "Online";
  type: "OPD" | "IPD" | "Emergency" | "Lab" | "Pharmacy";
  notes: string;
  createdBy: string;
  isLocked: boolean;
  insurance: IInsuranceClaim;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  taxableAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const BillItemSchema = new Schema<IBillItem>({
  description:  { type: String, required: true },
  category:     { type: String, enum: ["Consultation", "Lab", "Pharmacy", "Procedure", "Diagnosis", "Room", "Other"], default: "Other" },
  quantity:     { type: Number, default: 1 },
  unitPrice:    { type: Number, required: true },
  total:        { type: Number, required: true },
  hsnCode:      { type: String, default: "" },
  taxRate:      { type: Number, default: 0 },
  cgst:         { type: Number, default: 0 },
  sgst:         { type: Number, default: 0 },
  igst:         { type: Number, default: 0 },
  taxableAmount:{ type: Number, default: 0 },
  batchNo:      { type: String },
  expiryDate:   { type: Date },
  drugId:       { type: String },
}, { _id: true });

const PaymentEntrySchema = new Schema<IPaymentEntry>({
  paymentId:      { type: String, required: true },
  amount:         { type: Number, required: true },
  paymentMode:    { type: String, enum: ["Cash", "Card", "UPI", "Insurance", "Online", "Advance-Adjustment"], required: true },
  payer:          { type: String, default: "Self" },
  transactionRef: { type: String, default: "" },
  receivedBy:     { type: String, default: "" },
  notes:          { type: String, default: "" },
  paidAt:         { type: Date, default: Date.now },
}, { _id: true });

const AdvanceEntrySchema = new Schema<IAdvanceEntry>({
  amount:         { type: Number, required: true },
  receivedDate:   { type: Date, default: Date.now },
  receivedBy:     { type: String, default: "" },
  mode:           { type: String, enum: ["Cash", "Card", "UPI", "Insurance", "Online"], default: "Cash" },
  transactionRef: { type: String, default: "" },
}, { _id: true });

const InsuranceClaimSchema = new Schema<IInsuranceClaim>({
  tpaName:         { type: String, default: "" },
  policyNo:        { type: String, default: "" },
  memberNo:        { type: String, default: "" },
  claimNo:         { type: String, default: "" },
  preAuthNo:       { type: String, default: "" },
  preAuthStatus:   { type: String, enum: ["Pending", "Approved", "Rejected", "PartialApproval"] },
  preAuthAmount:   { type: Number, default: 0 },
  claimStatus:     { type: String, enum: ["Not-Filed", "Filed", "Under-Review", "Approved", "Rejected", "Settled", "Escalated"], default: "Not-Filed" },
  claimAmount:     { type: Number, default: 0 },
  settledAmount:   { type: Number, default: 0 },
  submittedDate:   { type: Date },
  settledDate:     { type: Date },
  rejectionReason: { type: String, default: "" },
}, { _id: false });

const BillingRecordSchema = new Schema<IBillingRecord>(
  {
    tenantId:       { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    billId:         { type: String, required: true },
    patientId:      { type: String, required: true },
    patientName:    { type: String, required: true },
    appointmentId:  { type: String },
    admissionId:    { type: String },
    date:           { type: Date, default: Date.now },
    items:          { type: [BillItemSchema], default: [] },
    amount:         { type: Number, required: true },
    paid:           { type: Number, default: 0 },
    balance:        { type: Number, default: 0 },
    discount:       { type: Number, default: 0 },
    discountType:   { type: String, enum: ["Flat", "Percent"], default: "Flat" },
    discountPercent:{ type: Number, default: 0 },
    totalAdvance:   { type: Number, default: 0 },
    advances:       { type: [AdvanceEntrySchema], default: [] },
    payments:       { type: [PaymentEntrySchema], default: [] },
    status:         { type: String, enum: ["Paid", "Partial", "Pending", "Claimed"], default: "Pending" },
    payer:          { type: String, default: "Self" },
    paymentMode:    { type: String, enum: ["Cash", "Card", "UPI", "Insurance", "Online"], default: "Cash" },
    type:           { type: String, enum: ["OPD", "IPD", "Emergency", "Lab", "Pharmacy"], default: "OPD" },
    notes:          { type: String, default: "" },
    createdBy:      { type: String, default: "" },
    isLocked:       { type: Boolean, default: false },
    insurance:      { type: InsuranceClaimSchema, default: () => ({ claimStatus: "Not-Filed" }) },
    totalCgst:      { type: Number, default: 0 },
    totalSgst:      { type: Number, default: 0 },
    totalIgst:      { type: Number, default: 0 },
    totalTax:       { type: Number, default: 0 },
    taxableAmount:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

BillingRecordSchema.index({ tenantId: 1, billId: 1 }, { unique: true });

export default mongoose.model<IBillingRecord>("BillingRecord", BillingRecordSchema);
