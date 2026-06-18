import mongoose, { Schema, Document } from "mongoose";

export type AdjustmentType =
  | "Damage"
  | "Expiry-Writeoff"
  | "Theft"
  | "Count-Correction"
  | "Return-to-Supplier"
  | "Opening-Stock";

export interface IStockAdjustment extends Document {
  tenantId: mongoose.Types.ObjectId;
  adjustmentId: string;
  drugId: mongoose.Types.ObjectId;
  drugName: string;
  batchId?: mongoose.Types.ObjectId;
  adjustmentType: AdjustmentType;
  quantityBefore: number;
  quantityAdjusted: number;
  quantityAfter: number;
  reason: string;
  adjustedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const StockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    tenantId:         { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    adjustmentId:     { type: String, required: true },
    drugId:           { type: Schema.Types.ObjectId, ref: "DrugInventory", required: true },
    drugName:         { type: String, required: true },
    batchId:          { type: Schema.Types.ObjectId, ref: "DrugBatch" },
    adjustmentType:   {
      type: String,
      enum: ["Damage", "Expiry-Writeoff", "Theft", "Count-Correction", "Return-to-Supplier", "Opening-Stock"],
      required: true,
    },
    quantityBefore:   { type: Number, required: true },
    quantityAdjusted: { type: Number, required: true },
    quantityAfter:    { type: Number, required: true },
    reason:           { type: String, required: true },
    adjustedBy:       { type: String, required: true },
  },
  { timestamps: true }
);

StockAdjustmentSchema.index({ tenantId: 1, drugId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ tenantId: 1, adjustmentId: 1 }, { unique: true });

export default mongoose.model<IStockAdjustment>("StockAdjustment", StockAdjustmentSchema);
