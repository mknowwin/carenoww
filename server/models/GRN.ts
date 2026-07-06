import mongoose, { Schema, Document } from "mongoose";

export interface IGRNItem {
  drugId: mongoose.Types.ObjectId;
  drugName: string;
  batchNo: string;
  expiryDate: Date;
  quantityReceived: number;
  purchasePricePerUnit: number;
  mrpPerUnit: number;
  totalCost: number;
}

export interface IGRN extends Document {
  tenantId: mongoose.Types.ObjectId;
  grnId: string;
  supplierName: string;
  invoiceNo: string;
  invoiceDate?: Date;
  receivedDate: Date;
  receivedBy: string;
  items: IGRNItem[];
  totalValue: number;
  status: "Draft" | "Received" | "Cancelled";
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const GRNItemSchema = new Schema<IGRNItem>({
  drugId:               { type: Schema.Types.ObjectId, ref: "DrugInventory", required: true },
  drugName:             { type: String, required: true },
  batchNo:              { type: String, required: true },
  expiryDate:           { type: Date, required: true },
  quantityReceived:     { type: Number, required: true },
  purchasePricePerUnit: { type: Number, default: 0 },
  mrpPerUnit:           { type: Number, default: 0 },
  totalCost:            { type: Number, default: 0 },
}, { _id: true });

const GRNSchema = new Schema<IGRN>(
  {
    tenantId:     { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    grnId:        { type: String, required: true },
    supplierName: { type: String, required: true },
    invoiceNo:    { type: String, default: "" },
    invoiceDate:  { type: Date },
    receivedDate: { type: Date, default: Date.now },
    receivedBy:   { type: String, default: "" },
    items:        { type: [GRNItemSchema], default: [] },
    totalValue:   { type: Number, default: 0 },
    status:       { type: String, enum: ["Draft", "Received", "Cancelled"], default: "Draft" },
    notes:        { type: String, default: "" },
  },
  { timestamps: true }
);

GRNSchema.index({ tenantId: 1, grnId: 1 }, { unique: true });

export default mongoose.model<IGRN>("GRN", GRNSchema);
