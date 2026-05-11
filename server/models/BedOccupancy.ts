import mongoose, { Schema, Document } from "mongoose";

export interface IBedOccupancy extends Document {
  tenantId: mongoose.Types.ObjectId;
  ward: string;
  total: number;
  occupied: number;
  available: number;
  updatedAt: Date;
}

const BedOccupancySchema = new Schema<IBedOccupancy>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    ward: { type: String, required: true },
    total: { type: Number, required: true },
    occupied: { type: Number, required: true },
    available: { type: Number, required: true },
  },
  { timestamps: true }
);

BedOccupancySchema.index({ tenantId: 1, ward: 1 }, { unique: true });

export default mongoose.model<IBedOccupancy>("BedOccupancy", BedOccupancySchema);
