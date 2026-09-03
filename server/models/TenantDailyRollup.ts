import mongoose, { Schema, Document } from "mongoose";

export interface ITenantDailyRollup extends Document {
  tenantId: mongoose.Types.ObjectId;
  date: string; // "YYYY-MM-DD", tenant-local day
  status: "provisional" | "final";
  computedAt: Date;

  appointments: {
    totalVisits: number;
    byDoctor: { doctor: string; visits: number }[];
    byDepartment: { department: string; visits: number }[];
    byReferralSource: { source: string; count: number }[];
    byReferralArea: { area: string; count: number }[];
  };
  labOrders: {
    totalOrders: number;
    byTest: { test: string; orders: number }[];
  };
  billing: {
    cashByMode: { paymentMode: string; total: number }[];
    cashGrandTotal: number;
    billsByTypeStatus: { type: string; status: string; count: number; amount: number }[];
    totalBills: number;
    totalAmount: number;
    discount: { totalDiscount: number; bills: number };
    cashFlow: { cashIn: number; cashOut: number; netCash: number; cancelledBills: number; cancelledAmount: number };
    timewiseSales: { hour: number; total: number; count: number }[];
  };
  pharmacy: {
    drugSales: { drugName: string; quantity: number; amount: number }[];
    totalQuantity: number;
    totalAmount: number;
  };
}

// Explicit sub-schemas, all with `_id: false` — the array-shorthand syntax (`{type: [{...}]}`)
// auto-adds an `_id` to every subdocument, which the live aggregation helpers these rollups
// must match never produce (they all `$project: {_id: 0, ...}`); keeping shape identical is
// what lets the read path splice settled-rollup rows and a live "today" tail together
// transparently. `BillsByTypeStatusSchema`'s inner `type` field additionally collides with
// Mongoose's reserved `type` schema keyword under the shorthand syntax — another reason
// these need to be explicit Schemas rather than plain object literals.
const ByDoctorSchema          = new Schema({ doctor: String, visits: Number }, { _id: false });
const ByDepartmentSchema      = new Schema({ department: String, visits: Number }, { _id: false });
const ByReferralSourceSchema  = new Schema({ source: String, count: Number }, { _id: false });
const ByReferralAreaSchema    = new Schema({ area: String, count: Number }, { _id: false });
const ByTestSchema            = new Schema({ test: String, orders: Number }, { _id: false });
const CashByModeSchema        = new Schema({ paymentMode: String, total: Number }, { _id: false });
const BillsByTypeStatusSchema = new Schema({ type: String, status: String, count: Number, amount: Number }, { _id: false });
const TimewiseSalesSchema     = new Schema({ hour: Number, total: Number, count: Number }, { _id: false });
const DrugSalesSchema         = new Schema({ drugName: String, quantity: Number, amount: Number }, { _id: false });

const TenantDailyRollupSchema = new Schema<ITenantDailyRollup>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    date:     { type: String, required: true },
    status:   { type: String, enum: ["provisional", "final"], default: "provisional" },
    computedAt: { type: Date, default: Date.now },

    appointments: {
      totalVisits:      { type: Number, default: 0 },
      byDoctor:          { type: [ByDoctorSchema], default: [] },
      byDepartment:      { type: [ByDepartmentSchema], default: [] },
      byReferralSource:  { type: [ByReferralSourceSchema], default: [] },
      byReferralArea:    { type: [ByReferralAreaSchema], default: [] },
    },
    labOrders: {
      totalOrders: { type: Number, default: 0 },
      byTest:      { type: [ByTestSchema], default: [] },
    },
    billing: {
      cashByMode:          { type: [CashByModeSchema], default: [] },
      cashGrandTotal:      { type: Number, default: 0 },
      billsByTypeStatus:   { type: [BillsByTypeStatusSchema], default: [] },
      totalBills:          { type: Number, default: 0 },
      totalAmount:         { type: Number, default: 0 },
      discount: {
        totalDiscount: { type: Number, default: 0 },
        bills:         { type: Number, default: 0 },
      },
      cashFlow: {
        cashIn:           { type: Number, default: 0 },
        cashOut:          { type: Number, default: 0 },
        netCash:          { type: Number, default: 0 },
        cancelledBills:   { type: Number, default: 0 },
        cancelledAmount:  { type: Number, default: 0 },
      },
      timewiseSales: { type: [TimewiseSalesSchema], default: [] },
    },
    pharmacy: {
      drugSales:    { type: [DrugSalesSchema], default: [] },
      totalQuantity:{ type: Number, default: 0 },
      totalAmount:  { type: Number, default: 0 },
    },
  },
  { timestamps: false }
);

TenantDailyRollupSchema.index({ tenantId: 1, date: 1 }, { unique: true });
TenantDailyRollupSchema.index({ tenantId: 1, status: 1, date: 1 });

export default mongoose.model<ITenantDailyRollup>("TenantDailyRollup", TenantDailyRollupSchema);
