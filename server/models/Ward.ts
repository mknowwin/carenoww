import mongoose, { Schema, Document } from "mongoose";

// Per-tenant ward master. `type` drives behaviour (ICU admissions set the
// patient's status to ICU); `name` is what staff see and what admissions store.
export const WARD_TYPES = ["General", "ICU", "Private", "Semi-Private", "Obs/Gyn", "Pediatric", "Other"] as const;
export type WardType = typeof WARD_TYPES[number];

export interface IWard extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code: string;          // short bed prefix, e.g. "GW" → beds GW-01, GW-02
  type: WardType;
  bedRateId?: string;    // ServiceRateMaster entry charged per bed-day (IPD billing)
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const WardSchema = new Schema<IWard>(
  {
    tenantId:  { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name:      { type: String, required: true, trim: true },
    code:      { type: String, default: "", trim: true, uppercase: true },
    type:      { type: String, enum: WARD_TYPES, default: "General" },
    bedRateId: { type: String, default: "" },
    active:    { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WardSchema.index({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model<IWard>("Ward", WardSchema);
