import mongoose, { Schema, Document } from "mongoose";

export interface IDrugInventory extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  stock: number;
  unit: string;
  reorderLevel: number;
  expiryDate?: Date;
  status: "OK" | "Low" | "Critical";
  supplier: string;
  category: string;
  hsnCode: string;
  mrpPerUnit: number;
  purchasePricePerUnit: number;
  isBatchTracked: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DrugInventorySchema = new Schema<IDrugInventory>(
  {
    tenantId:             { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name:                 { type: String, required: true, trim: true },
    stock:                { type: Number, required: true, default: 0 },
    unit:                 { type: String, required: true },
    reorderLevel:         { type: Number, required: true, default: 100 },
    expiryDate:           { type: Date },
    status:               { type: String, enum: ["OK", "Low", "Critical"], default: "OK" },
    supplier:             { type: String, default: "" },
    category:             { type: String, default: "" },
    hsnCode:              { type: String, default: "" },
    mrpPerUnit:           { type: Number, default: 0 },
    purchasePricePerUnit: { type: Number, default: 0 },
    isBatchTracked:       { type: Boolean, default: false },
    isActive:             { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

DrugInventorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IDrugInventory>("DrugInventory", DrugInventorySchema);
