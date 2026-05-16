import mongoose, { Schema, Document } from "mongoose";

export interface IRxItem {
  drug: string;
  dose: string;
  route: "Oral" | "IV" | "IM" | "SC" | "Topical" | "Inhaled" | "Rectal" | "SL";
  frequency: "OD" | "BD" | "TID" | "QID" | "SOS" | "Stat" | "HS" | "Q4H" | "Q6H" | "Q8H";
  duration: string;
  instructions: string;
  quantity: number;
}

export interface IPrescription extends Document {
  tenantId: mongoose.Types.ObjectId;
  rxId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  admissionId?: string;
  prescribedBy: string;
  prescribedById?: string;
  date: Date;
  type: "OPD" | "IPD";
  items: IRxItem[];
  notes: string;
  status: "Active" | "Dispensed" | "Cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const RxItemSchema = new Schema<IRxItem>({
  drug:         { type: String, required: true },
  dose:         { type: String, required: true },
  route:        { type: String, enum: ["Oral","IV","IM","SC","Topical","Inhaled","Rectal","SL"], default: "Oral" },
  frequency:    { type: String, enum: ["OD","BD","TID","QID","SOS","Stat","HS","Q4H","Q6H","Q8H"], default: "OD" },
  duration:     { type: String, default: "" },
  instructions: { type: String, default: "" },
  quantity:     { type: Number, default: 1 },
}, { _id: true });

const PrescriptionSchema = new Schema<IPrescription>(
  {
    tenantId:       { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    rxId:           { type: String, required: true },
    patientId:      { type: String, required: true },
    patientName:    { type: String, required: true },
    appointmentId:  { type: String },
    admissionId:    { type: String },
    prescribedBy:   { type: String, required: true },
    prescribedById: { type: String },
    date:           { type: Date, default: Date.now },
    type:           { type: String, enum: ["OPD","IPD"], default: "OPD" },
    items:          { type: [RxItemSchema], required: true },
    notes:          { type: String, default: "" },
    status:         { type: String, enum: ["Active","Dispensed","Cancelled"], default: "Active" },
  },
  { timestamps: true }
);

PrescriptionSchema.index({ tenantId: 1, rxId: 1 }, { unique: true });
PrescriptionSchema.index({ tenantId: 1, patientId: 1 });

export default mongoose.model<IPrescription>("Prescription", PrescriptionSchema);
