import mongoose, { Schema, Document } from "mongoose";

export interface IAppointment extends Document {
  tenantId: mongoose.Types.ObjectId;
  aptId: string;
  patientId: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  doctorId?: string;
  doctor: string;
  department: string;
  date: string;
  time: string;
  type: "New" | "Follow-up" | "Emergency" | "Teleconsult" | "Home Visit";
  status: "Scheduled" | "Confirmed" | "Waiting" | "In Consult" | "Completed" | "Cancelled";
  token: string;
  tokenNumber: number;
  notes: string;
  referringDoctor?: string;
  vitals?: { bp?: string; pulse?: string; temp?: string; spo2?: string; weight?: string; height?: string };
  soap?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  checkedInAt?: Date;
  calledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    aptId:         { type: String, required: true },
    patientId:     { type: String, required: true },
    patientName:   { type: String, required: true },
    patientAge:    { type: Number },
    patientGender: { type: String, default: "" },
    patientPhone:  { type: String, default: "" },
    doctorId:      { type: String, default: "" },
    doctor:        { type: String, required: true },
    department:    { type: String, required: true },
    date:          { type: String, required: true },
    time:          { type: String, required: true },
    type:          { type: String, enum: ["New", "Follow-up", "Emergency", "Teleconsult", "Home Visit"], required: true },
    status:        { type: String, enum: ["Scheduled", "Confirmed", "Waiting", "In Consult", "Completed", "Cancelled"], default: "Scheduled" },
    token:         { type: String, default: "" },
    tokenNumber:   { type: Number, default: 0 },
    notes:            { type: String, default: "" },
    referringDoctor:  { type: String, default: "" },
    vitals: {
      bp:     { type: String, default: "" },
      pulse:  { type: String, default: "" },
      temp:   { type: String, default: "" },
      spo2:   { type: String, default: "" },
      weight: { type: String, default: "" },
      height: { type: String, default: "" },
    },
    soap: {
      subjective: { type: String, default: "" },
      objective:  { type: String, default: "" },
      assessment: { type: String, default: "" },
      plan:       { type: String, default: "" },
    },
    checkedInAt:   { type: Date },
    calledAt:      { type: Date },
  },
  { timestamps: true }
);

AppointmentSchema.index({ tenantId: 1, aptId: 1 }, { unique: true });
AppointmentSchema.index({ tenantId: 1, date: 1 });
AppointmentSchema.index({ tenantId: 1, doctor: 1, date: 1 });
AppointmentSchema.index({ tenantId: 1, date: 1, status: 1 });

export default mongoose.model<IAppointment>("Appointment", AppointmentSchema);
