import mongoose, { Schema, Document } from "mongoose";

export interface ISupplier extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstNo: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name:     { type: String, required: true, trim: true },
    phone:    { type: String, default: "" },
    email:    { type: String, default: "" },
    address:  { type: String, default: "" },
    gstNo:    { type: String, default: "" },
  },
  { timestamps: true }
);

SupplierSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model<ISupplier>("Supplier", SupplierSchema);
