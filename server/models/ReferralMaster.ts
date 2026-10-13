import mongoose, { Schema, Document } from "mongoose";

// Master list for free-text referral fields captured on appointments:
// the Area / locality, and the referrer name for non-doctor sources.
export const REFERRAL_MASTER_KINDS = ["Area", "VHN", "Medical Shop", "Lab", "Other"] as const;
export type ReferralMasterKind = typeof REFERRAL_MASTER_KINDS[number];

export interface IReferralMaster extends Document {
  tenantId: mongoose.Types.ObjectId;
  kind: ReferralMasterKind;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralMasterSchema = new Schema<IReferralMaster>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    kind:     { type: String, enum: REFERRAL_MASTER_KINDS, required: true },
    name:     { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

ReferralMasterSchema.index({ tenantId: 1, kind: 1, name: 1 });

export default mongoose.model<IReferralMaster>("ReferralMaster", ReferralMasterSchema);
