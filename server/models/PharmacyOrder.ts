import mongoose, { Schema, Document } from "mongoose";

export interface IPharmacyOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  rxId: string;
  patientId: string;
  patientName: string;
  drug: string;
  qty: number;
  unit: string;
  status: "Pending" | "Verified" | "Dispensed";
  type: "OPD" | "IPD" | "ICU";
  doctor: string;
  time: string;
  createdAt: Date;
  updatedAt: Date;
}

const PharmacyOrderSchema = new Schema<IPharmacyOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    rxId: { type: String, required: true },
    patientId: { type: String, required: true },
    patientName: { type: String, required: true },
    drug: { type: String, required: true },
    qty: { type: Number, required: true },
    unit: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Verified", "Dispensed"], default: "Pending" },
    type: { type: String, enum: ["OPD", "IPD", "ICU"], required: true },
    doctor: { type: String, default: "" },
    time: { type: String, default: "" },
  },
  { timestamps: true }
);

PharmacyOrderSchema.index({ tenantId: 1, rxId: 1 }, { unique: true });

export default mongoose.model<IPharmacyOrder>("PharmacyOrder", PharmacyOrderSchema);
