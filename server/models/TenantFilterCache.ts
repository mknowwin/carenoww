import mongoose, { Schema, Document } from "mongoose";

export type FilterCacheKey = "investigationTypes" | "diagnoses";

export interface ITenantFilterCache extends Document {
  tenantId: mongoose.Types.ObjectId;
  key: FilterCacheKey;
  values: string[];
  computedAt: Date;
}

const TenantFilterCacheSchema = new Schema<ITenantFilterCache>({
  tenantId:   { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  key:        { type: String, enum: ["investigationTypes", "diagnoses"], required: true },
  values:     { type: [String], default: [] },
  computedAt: { type: Date, default: Date.now },
});

TenantFilterCacheSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export default mongoose.model<ITenantFilterCache>("TenantFilterCache", TenantFilterCacheSchema);
