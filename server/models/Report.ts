import mongoose, { Schema, Document } from "mongoose";

export interface IReport extends Document {
  tenantId: mongoose.Types.ObjectId;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  fileName: string;
  fileType: string;
  fileData: string;   // base64-encoded file content
  fileSize: number;   // bytes
  notes: string;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    patientId:     { type: String, required: true, index: true },
    patientName:   { type: String, required: true },
    appointmentId: { type: String, default: "" },
    fileName:      { type: String, required: true },
    fileType:      { type: String, required: true },
    fileData:      { type: String, required: true },
    fileSize:      { type: Number, default: 0 },
    notes:         { type: String, default: "" },
    uploadedBy:    { type: String, default: "" },
  },
  { timestamps: true }
);

ReportSchema.index({ tenantId: 1, patientId: 1 });

export default mongoose.model<IReport>("Report", ReportSchema);
