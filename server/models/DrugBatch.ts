import mongoose, { Schema, Document } from "mongoose";

export interface IDrugBatch extends Document {
  tenantId: mongoose.Types.ObjectId;
  drugId: mongoose.Types.ObjectId;
  batchNo: string;
  lotNo: string;
  supplierName: string;
  manufacturingDate?: Date;
  expiryDate: Date;
  quantityReceived: number;
  quantityRemaining: number;
  purchasePricePerUnit: number;
  mrpPerUnit: number;
  grnId?: mongoose.Types.ObjectId;
  status: "Active" | "Exhausted" | "Expired" | "Quarantine" | "Cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const DrugBatchSchema = new Schema<IDrugBatch>(
  {
    tenantId:             { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    drugId:               { type: Schema.Types.ObjectId, ref: "DrugInventory", required: true, index: true },
    batchNo:              { type: String, required: true, trim: true },
    lotNo:                { type: String, default: "" },
    supplierName:         { type: String, default: "" },
    manufacturingDate:    { type: Date },
    expiryDate:           { type: Date, required: true, index: true },
    quantityReceived:     { type: Number, required: true, default: 0 },
    quantityRemaining:    { type: Number, required: true, default: 0 },
    purchasePricePerUnit: { type: Number, default: 0 },
    mrpPerUnit:           { type: Number, default: 0 },
    grnId:                { type: Schema.Types.ObjectId, ref: "GRN" },
    status:               { type: String, enum: ["Active", "Exhausted", "Expired", "Quarantine", "Cancelled"], default: "Active" },
  },
  { timestamps: true }
);

// FEFO queries: get batches for a drug ordered by expiry
DrugBatchSchema.index({ tenantId: 1, drugId: 1, expiryDate: 1 });
// Prevent duplicate line items within the same GRN; the same drug + batch number
// is allowed to recur across different GRNs (e.g. repeat deliveries of one batch).
DrugBatchSchema.index({ tenantId: 1, grnId: 1, drugId: 1, batchNo: 1 }, { unique: true });

export default mongoose.model<IDrugBatch>("DrugBatch", DrugBatchSchema);
