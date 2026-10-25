import mongoose, { Schema, Document } from "mongoose";

// Physical bed inside a ward. Occupancy is NOT stored here — a bed is occupied
// when an Active IPDAdmission has its bedId (unique index on the admission).
// `status` is housekeeping only: a vacated bed goes to Cleaning until staff mark it ready.
export const BED_STATUSES = ["Available", "Cleaning", "Maintenance"] as const;
export type BedStatus = typeof BED_STATUSES[number];

export interface IBed extends Document {
  tenantId: mongoose.Types.ObjectId;
  wardId: mongoose.Types.ObjectId;
  number: string;        // normalised: uppercase, no spaces
  status: BedStatus;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BedSchema = new Schema<IBed>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    wardId:   { type: Schema.Types.ObjectId, ref: "Ward", required: true },
    number:   { type: String, required: true },
    status:   { type: String, enum: BED_STATUSES, default: "Available" },
    active:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

BedSchema.index({ tenantId: 1, wardId: 1, number: 1 }, { unique: true });

export default mongoose.model<IBed>("Bed", BedSchema);
