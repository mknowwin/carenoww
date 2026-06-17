import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  drugId?: mongoose.Types.ObjectId;
  drugName: string;
  batchId?: mongoose.Types.ObjectId;
  batchNo: string;
  quantity: number;
  unit: string;
  mrpPerUnit: number;
  totalAmount: number;
}

export interface IPharmacyOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  rxId: string;
  patientId: string;
  patientName: string;
  // Legacy flat fields — kept for backward compat with old orders
  drug: string;
  qty: number;
  unit: string;
  // Structured items (set on new orders; empty on legacy orders)
  items: IOrderItem[];
  status: "Pending" | "Verified" | "Dispensed";
  type: "OPD" | "IPD" | "ICU";
  rxSource: "Digital" | "Paper" | "OTC";
  paperRxNote: string;
  doctor: string;
  time: string;
  prescriptionId?: string;
  dispensedBy?: string;
  dispensedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  drugId:      { type: Schema.Types.ObjectId, ref: "DrugInventory" },
  drugName:    { type: String, required: true },
  batchId:     { type: Schema.Types.ObjectId, ref: "DrugBatch" },
  batchNo:     { type: String, default: "" },
  quantity:    { type: Number, required: true, default: 1 },
  unit:        { type: String, default: "" },
  mrpPerUnit:  { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
}, { _id: true });

const PharmacyOrderSchema = new Schema<IPharmacyOrder>(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    rxId:          { type: String, required: true },
    patientId:     { type: String, required: true },
    patientName:   { type: String, required: true },
    drug:          { type: String, default: "" },
    qty:           { type: Number, default: 0 },
    unit:          { type: String, default: "" },
    items:         { type: [OrderItemSchema], default: [] },
    status:        { type: String, enum: ["Pending", "Verified", "Dispensed"], default: "Pending" },
    type:          { type: String, enum: ["OPD", "IPD", "ICU"], required: true },
    rxSource:      { type: String, enum: ["Digital", "Paper", "OTC"], default: "Digital" },
    paperRxNote:   { type: String, default: "" },
    doctor:        { type: String, default: "" },
    time:          { type: String, default: "" },
    prescriptionId:{ type: String },
    dispensedBy:   { type: String },
    dispensedAt:   { type: Date },
    notes:         { type: String },
  },
  { timestamps: true }
);

PharmacyOrderSchema.index({ tenantId: 1, rxId: 1 }, { unique: true });

export default mongoose.model<IPharmacyOrder>("PharmacyOrder", PharmacyOrderSchema);
