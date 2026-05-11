import mongoose, { Schema, Document } from "mongoose";

export interface IDrugInventory extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  stock: number;
  unit: string;
  reorderLevel: number;
  expiryDate: Date;
  status: "OK" | "Low" | "Critical";
  supplier: string;
  createdAt: Date;
  updatedAt: Date;
}

const DrugInventorySchema = new Schema<IDrugInventory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    stock: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true },
    reorderLevel: { type: Number, required: true, default: 100 },
    expiryDate: { type: Date, required: true },
    status: { type: String, enum: ["OK", "Low", "Critical"], default: "OK" },
    supplier: { type: String, default: "" },
  },
  { timestamps: true }
);

DrugInventorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IDrugInventory>("DrugInventory", DrugInventorySchema);
