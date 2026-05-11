import mongoose, { Schema, Document } from "mongoose";

export interface IPatient extends Document {
  tenantId: mongoose.Types.ObjectId;
  uhid: string;
  name: string;
  age: number;
  gender: "M" | "F" | "O";
  bloodGroup: string;
  phone: string;
  address: string;
  department: string;
  status: "OPD" | "IPD" | "ICU" | "Discharged";
  admittedOn: Date;
  doctor: string;
  diagnosis: string;
  insurance: string;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    uhid: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ["M", "F", "O"], required: true },
    bloodGroup: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    department: { type: String, required: true },
    status: { type: String, enum: ["OPD", "IPD", "ICU", "Discharged"], default: "OPD" },
    admittedOn: { type: Date, default: Date.now },
    doctor: { type: String, default: "" },
    diagnosis: { type: String, default: "" },
    insurance: { type: String, default: "None" },
    riskLevel: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Low" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PatientSchema.index({ tenantId: 1, uhid: 1 }, { unique: true });
PatientSchema.index({ tenantId: 1, name: "text" });

export default mongoose.model<IPatient>("Patient", PatientSchema);
