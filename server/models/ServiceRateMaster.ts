import mongoose, { Schema, Document } from "mongoose";

export interface IServiceRate extends Document {
  tenantId: mongoose.Types.ObjectId;
  category: "Consultation" | "Lab" | "Pharmacy" | "Procedure" | "Diagnosis" | "Room" | "Bed Charges" | "Nursing" | "Other";
  name: string;
  defaultRate: number;
  unit: string;
  hsnCode: string;
  taxRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceRateSchema = new Schema<IServiceRate>(
  {
    tenantId:    { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    category:    { type: String, enum: ["Consultation", "Lab", "Pharmacy", "Procedure", "Diagnosis", "Room", "Bed Charges", "Nursing", "Other"], required: true },
    name:        { type: String, required: true, trim: true },
    defaultRate: { type: Number, required: true, default: 0 },
    unit:        { type: String, default: "per visit" },
    hsnCode:     { type: String, default: "" },
    taxRate:     { type: Number, default: 0 },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

ServiceRateSchema.index({ tenantId: 1, category: 1 });
ServiceRateSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model<IServiceRate>("ServiceRateMaster", ServiceRateSchema);
