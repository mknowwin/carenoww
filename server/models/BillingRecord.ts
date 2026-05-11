import mongoose, { Schema, Document } from "mongoose";

export interface IBillingRecord extends Document {
  tenantId: mongoose.Types.ObjectId;
  billId: string;
  patientId: string;
  patientName: string;
  date: Date;
  amount: number;
  paid: number;
  balance: number;
  status: "Paid" | "Partial" | "Pending" | "Claimed";
  payer: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillingRecordSchema = new Schema<IBillingRecord>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    billId: { type: String, required: true },
    patientId: { type: String, required: true },
    patientName: { type: String, required: true },
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ["Paid", "Partial", "Pending", "Claimed"], default: "Pending" },
    payer: { type: String, default: "Cash" },
    type: { type: String, default: "OPD" },
  },
  { timestamps: true }
);

BillingRecordSchema.index({ tenantId: 1, billId: 1 }, { unique: true });

export default mongoose.model<IBillingRecord>("BillingRecord", BillingRecordSchema);
