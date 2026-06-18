import mongoose, { Schema, Document } from "mongoose";

export type TenantPlan = "trial" | "starter" | "professional" | "enterprise";
export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

export interface ITenant extends Document {
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  trialEndsAt: Date;
  contact: {
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
  };
  settings: {
    maxUsers: number;
    maxPatients: number;
    modules: string[];
    logoUrl: string;
    clinicPhone: string;
    clinicAddress: string;
    gstNo?: string;
    invoicePrefix?: string;
    taxConfig?: {
      cgstRate: number;
      sgstRate: number;
      igstRate: number;
      taxInclusivePricing: boolean;
    };
  };
  subscription: {
    startedAt: Date;
    expiresAt: Date;
    amount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    plan: { type: String, enum: ["trial", "starter", "professional", "enterprise"], default: "trial" },
    status: { type: String, enum: ["trial", "active", "suspended", "cancelled"], default: "trial" },
    trialEndsAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    contact: {
      email: { type: String, required: true },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: { type: String, default: "India" },
    },
    settings: {
      maxUsers:      { type: Number, default: 10 },
      maxPatients:   { type: Number, default: 1000 },
      modules:       { type: [String], default: ["dashboard", "patients", "appointments", "opd", "ipd", "lab", "pharmacy", "billing", "analytics"] },
      logoUrl:       { type: String, default: "" },
      clinicPhone:   { type: String, default: "" },
      clinicAddress: { type: String, default: "" },
      gstNo:         { type: String, default: "" },
      invoicePrefix: { type: String, default: "BILL" },
      taxConfig: {
        cgstRate:            { type: Number, default: 0 },
        sgstRate:            { type: Number, default: 0 },
        igstRate:            { type: Number, default: 0 },
        taxInclusivePricing: { type: Boolean, default: false },
      },
    },
    subscription: {
      startedAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      amount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model<ITenant>("Tenant", TenantSchema);
