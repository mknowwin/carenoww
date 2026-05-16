import mongoose, { Schema, Document } from "mongoose";

export interface ILabOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  labId: string;
  patientId: string;
  patientName: string;
  test: string;
  ordered: Date;
  status: "Pending" | "Collected" | "Processing" | "Completed" | "Scheduled";
  result: string | null;
  priority: "Routine" | "Urgent" | "STAT";
  doctor: string;
  appointmentId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LabOrderSchema = new Schema<ILabOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    labId: { type: String, required: true },
    patientId: { type: String, required: true },
    patientName: { type: String, required: true },
    test: { type: String, required: true },
    ordered: { type: Date, default: Date.now },
    status: { type: String, enum: ["Pending", "Collected", "Processing", "Completed", "Scheduled"], default: "Pending" },
    result: { type: String, default: null },
    priority: { type: String, enum: ["Routine", "Urgent", "STAT"], default: "Routine" },
    doctor: { type: String, default: "" },
    appointmentId: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

LabOrderSchema.index({ tenantId: 1, labId: 1 }, { unique: true });

export default mongoose.model<ILabOrder>("LabOrder", LabOrderSchema);
