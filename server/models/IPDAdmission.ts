import mongoose, { Schema, Document } from "mongoose";

export interface IRound {
  roundedAt: Date;
  nurse: string;
  bp: string;
  pulse: number;
  temp: number;
  spo2: number;
  weight?: number;
  notes: string;
}

export interface IDischarge {
  finalDiagnosis: string;
  treatment: string;
  medications: string;
  followUp: string;
  condition: "Improved" | "Same" | "Deteriorated" | "Expired" | "LAMA";
  notes: string;
  dischargedBy: string;
}

export interface IIPDAdmission extends Document {
  tenantId: mongoose.Types.ObjectId;
  admissionId: string;
  patientId: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  appointmentId?: string;
  admittingDoctor: string;
  admittingDoctorId?: string;
  department: string;
  ward: string;
  bedNumber: string;
  admissionDate: Date;
  provisionalDiagnosis: string;
  status: "Active" | "Discharged" | "Transferred";
  rounds: IRound[];
  discharge?: IDischarge;
  dischargeDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RoundSchema = new Schema<IRound>({
  roundedAt:  { type: Date, default: Date.now },
  nurse:      { type: String, required: true },
  bp:         { type: String, default: "" },
  pulse:      { type: Number, default: 0 },
  temp:       { type: Number, default: 0 },
  spo2:       { type: Number, default: 0 },
  weight:     { type: Number },
  notes:      { type: String, default: "" },
}, { _id: true });

const DischargeSchema = new Schema<IDischarge>({
  finalDiagnosis: { type: String, default: "" },
  treatment:      { type: String, default: "" },
  medications:    { type: String, default: "" },
  followUp:       { type: String, default: "" },
  condition:      { type: String, enum: ["Improved","Same","Deteriorated","Expired","LAMA"], default: "Improved" },
  notes:          { type: String, default: "" },
  dischargedBy:   { type: String, default: "" },
}, { _id: false });

const IPDAdmissionSchema = new Schema<IIPDAdmission>(
  {
    tenantId:          { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    admissionId:       { type: String, required: true },
    patientId:         { type: String, required: true },
    patientName:       { type: String, required: true },
    patientAge:        { type: Number },
    patientGender:     { type: String },
    patientPhone:      { type: String },
    appointmentId:     { type: String },
    admittingDoctor:   { type: String, required: true },
    admittingDoctorId: { type: String },
    department:        { type: String, required: true },
    ward:              { type: String, required: true },
    bedNumber:         { type: String, required: true },
    admissionDate:     { type: Date, default: Date.now },
    provisionalDiagnosis: { type: String, required: true },
    status:            { type: String, enum: ["Active","Discharged","Transferred"], default: "Active" },
    rounds:            { type: [RoundSchema], default: [] },
    discharge:         { type: DischargeSchema },
    dischargeDate:     { type: Date },
  },
  { timestamps: true }
);

IPDAdmissionSchema.index({ tenantId: 1, admissionId: 1 }, { unique: true });
IPDAdmissionSchema.index({ tenantId: 1, status: 1 });
IPDAdmissionSchema.index({ tenantId: 1, patientId: 1 });

export default mongoose.model<IIPDAdmission>("IPDAdmission", IPDAdmissionSchema);
