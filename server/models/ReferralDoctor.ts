import mongoose, { Schema, Document } from "mongoose";

export interface IReferralDoctor extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  specialization: string;
  phone: string;
  hospital: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralDoctorSchema = new Schema<IReferralDoctor>(
  {
    tenantId:       { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name:           { type: String, required: true, trim: true },
    specialization: { type: String, default: "" },
    phone:          { type: String, default: "" },
    hospital:       { type: String, default: "" },
  },
  { timestamps: true }
);

ReferralDoctorSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model<IReferralDoctor>("ReferralDoctor", ReferralDoctorSchema);
