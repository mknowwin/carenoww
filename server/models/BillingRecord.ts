import mongoose, { Schema, Document } from "mongoose";

export interface IBillItem {
  description: string;
  category: "Consultation" | "Lab" | "Pharmacy" | "Procedure" | "Room" | "Other";
  quantity: number;
  unitPrice: number;
  total: number;
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
  status: "Paid" | "Partial" | "Pending" | "Claimed";
  payer: string;
  paymentMode: "Cash" | "Card" | "UPI" | "Insurance" | "Online";
  type: "OPD" | "IPD" | "Emergency" | "Lab" | "Pharmacy";
  notes: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillItemSchema = new Schema<IBillItem>({
  description: { type: String, required: true },
  category:    { type: String, enum: ["Consultation","Lab","Pharmacy","Procedure","Room","Other"], default: "Other" },
  quantity:    { type: Number, default: 1 },
  unitPrice:   { type: Number, required: true },
  total:       { type: Number, required: true },
}, { _id: true });

const BillingRecordSchema = new Schema<IBillingRecord>(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    billId:        { type: String, required: true },
    patientId:     { type: String, required: true },
    patientName:   { type: String, required: true },
    appointmentId: { type: String },
    admissionId:   { type: String },
    date:          { type: Date, default: Date.now },
    items:         { type: [BillItemSchema], default: [] },
    amount:        { type: Number, required: true },
    paid:          { type: Number, default: 0 },
    balance:       { type: Number, default: 0 },
    discount:      { type: Number, default: 0 },
    status:        { type: String, enum: ["Paid","Partial","Pending","Claimed"], default: "Pending" },
    payer:         { type: String, default: "Self" },
    paymentMode:   { type: String, enum: ["Cash","Card","UPI","Insurance","Online"], default: "Cash" },
    type:          { type: String, enum: ["OPD","IPD","Emergency","Lab","Pharmacy"], default: "OPD" },
    notes:         { type: String, default: "" },
    createdBy:     { type: String, default: "" },
  },
  { timestamps: true }
);

BillingRecordSchema.index({ tenantId: 1, billId: 1 }, { unique: true });

export default mongoose.model<IBillingRecord>("BillingRecord", BillingRecordSchema);
