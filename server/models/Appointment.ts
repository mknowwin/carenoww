import mongoose, { Schema, Document } from "mongoose";

export interface IAppointment extends Document {
  tenantId: mongoose.Types.ObjectId;
  aptId: string;
  patientId: string;
  patientName: string;
  doctor: string;
  department: string;
  date: string;
  time: string;
  type: "New" | "Follow-up" | "Emergency" | "Teleconsult" | "Home Visit";
  status: "Scheduled" | "Confirmed" | "Waiting" | "In Consult" | "Completed" | "Cancelled";
  token: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    aptId: { type: String, required: true },
    patientId: { type: String, required: true },
    patientName: { type: String, required: true },
    doctor: { type: String, required: true },
    department: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    type: { type: String, enum: ["New", "Follow-up", "Emergency", "Teleconsult", "Home Visit"], required: true },
    status: { type: String, enum: ["Scheduled", "Confirmed", "Waiting", "In Consult", "Completed", "Cancelled"], default: "Scheduled" },
    token: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

AppointmentSchema.index({ tenantId: 1, aptId: 1 }, { unique: true });
AppointmentSchema.index({ tenantId: 1, date: 1 });

export default mongoose.model<IAppointment>("Appointment", AppointmentSchema);
