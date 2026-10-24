import mongoose, { Schema, Document } from "mongoose";

// Per-tenant ICD-10 master, suggested while typing the SOAP Assessment.
// Seeded from server/data/icd10Common.ts; each hospital can add/edit its own.
export interface IIcdCode extends Document {
  tenantId: mongoose.Types.ObjectId;
  code: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const IcdCodeSchema = new Schema<IIcdCode>(
  {
    tenantId:    { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    code:        { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, required: true, trim: true },
    active:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

IcdCodeSchema.index({ tenantId: 1, code: 1 }, { unique: true });
IcdCodeSchema.index({ tenantId: 1, description: 1 });

export default mongoose.model<IIcdCode>("IcdCode", IcdCodeSchema);
