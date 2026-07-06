import mongoose, { Schema, Document } from "mongoose";

export interface IInventoryChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface IInventoryAuditLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  drugId: mongoose.Types.ObjectId;
  action: "Created" | "Updated" | "Deactivated" | "Reactivated";
  changes: IInventoryChange[];
  performedBy: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryChangeSchema = new Schema<IInventoryChange>(
  {
    field:    { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const InventoryAuditLogSchema = new Schema<IInventoryAuditLog>(
  {
    tenantId:    { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    drugId:      { type: Schema.Types.ObjectId, ref: "DrugInventory", required: true },
    action:      { type: String, enum: ["Created", "Updated", "Deactivated", "Reactivated"], required: true },
    changes:     { type: [InventoryChangeSchema], default: [] },
    performedBy: { type: String, required: true },
    notes:       { type: String, default: "" },
  },
  { timestamps: true }
);

InventoryAuditLogSchema.index({ tenantId: 1, drugId: 1, createdAt: -1 });

export default mongoose.model<IInventoryAuditLog>("InventoryAuditLog", InventoryAuditLogSchema);
