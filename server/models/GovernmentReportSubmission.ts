import mongoose, { Schema, Document } from "mongoose";

export type GovReportType = "HMIS-Monthly" | "PharmacyAudit";
export type GovReportStatus = "Draft" | "Finalized" | "Submitted";

export interface IGovernmentReportSubmission extends Document {
  tenantId: mongoose.Types.ObjectId;
  submissionId: string; // "GOVSUB-0001"
  reportType: GovReportType;
  periodFrom: string; // "YYYY-MM-DD"
  periodTo: string;
  generatedAt: Date;
  generatedBy: string;
  generatedById: string;
  snapshotData: any; // frozen JSON — the exact computed rows/totals at generation time
  status: GovReportStatus;
  submittedAt?: Date;
  submittedBy?: string;
  referenceNo?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GovernmentReportSubmissionSchema = new Schema<IGovernmentReportSubmission>(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    submissionId:  { type: String, required: true },
    reportType:    { type: String, enum: ["HMIS-Monthly", "PharmacyAudit"], required: true },
    periodFrom:    { type: String, required: true },
    periodTo:      { type: String, required: true },
    generatedAt:   { type: Date, default: Date.now },
    generatedBy:   { type: String, default: "" },
    generatedById: { type: String, default: "" },
    snapshotData:  { type: Schema.Types.Mixed, default: {} },
    status:        { type: String, enum: ["Draft", "Finalized", "Submitted"], default: "Draft" },
    submittedAt:   { type: Date },
    submittedBy:   { type: String },
    referenceNo:   { type: String },
    notes:         { type: String, default: "" },
  },
  { timestamps: true }
);

GovernmentReportSubmissionSchema.index({ tenantId: 1, submissionId: 1 }, { unique: true });
GovernmentReportSubmissionSchema.index({ tenantId: 1, reportType: 1, periodFrom: 1 });

export default mongoose.model<IGovernmentReportSubmission>("GovernmentReportSubmission", GovernmentReportSubmissionSchema);
