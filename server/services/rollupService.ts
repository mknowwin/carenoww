import mongoose from "mongoose";
import Tenant from "../models/Tenant.js";
import TenantDailyRollup from "../models/TenantDailyRollup.js";
import TenantFilterCache from "../models/TenantFilterCache.js";
import BillingRecord from "../models/BillingRecord.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";
import { _live, liveInvestigationTypes, liveDiagnoses } from "./insightsService.js";
import { liveDrugSalesReport } from "./pharmacyReportService.js";

const CONCURRENCY = 5;

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    await Promise.all(batch.map((item) => fn(item).catch((err) => console.error("rollup batch item failed:", err))));
  }
}

// Computes every metric for one tenant-day from source truth and upserts a single
// TenantDailyRollup doc. Reuses the exact same live-aggregation helpers the read
// path falls back to (server/services/insightsService.ts's `_live`) — there is
// exactly one implementation of "how to compute doctor-wise counts", ever.
export async function refreshTenantDay(tenantId: string, dateStr: string, tz: string) {
  const start = startOfDayUtc(dateStr, tz);
  const end = endOfDayUtc(dateStr, tz);

  const [
    byDoctor, byDepartment, byTest,
    cashCollected, dailyBills, byReferralSource, byReferralArea,
    timewiseSales, cashFlow, drugSales, discountAgg,
  ] = await Promise.all([
    _live.doctorWise(tenantId, dateStr, dateStr),
    _live.departmentWise(tenantId, dateStr, dateStr),
    _live.investigationWise(tenantId, start, end),
    _live.cashCollected(tenantId, start, end),
    _live.dailyBillsCount(tenantId, start, end),
    _live.referralsBySource(tenantId, dateStr, dateStr),
    _live.referralsByArea(tenantId, dateStr, dateStr),
    _live.timewiseSales(tenantId, tz, start, end),
    _live.cashFlow(tenantId, start, end),
    liveDrugSalesReport(tenantId, tz, dateStr),
    // Discount total for the day — same BillingRecord scope as dailyBills, computed
    // separately since it's not part of any existing live() helper's return shape.
    BillingRecord.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), docType: "Bill", date: { $gte: start, $lte: end }, discount: { $gt: 0 } } },
      { $group: { _id: null, totalDiscount: { $sum: "$discount" }, bills: { $sum: 1 } } },
    ]),
  ]);
  const discount = { totalDiscount: discountAgg[0]?.totalDiscount ?? 0, bills: discountAgg[0]?.bills ?? 0 };

  const totalVisits = byDoctor.reduce((s: number, r: any) => s + r.visits, 0);

  const status = dateStr === todayInTz(tz) ? "provisional" : "final";

  await TenantDailyRollup.findOneAndUpdate(
    { tenantId, date: dateStr },
    {
      $set: {
        status,
        computedAt: new Date(),
        appointments: {
          totalVisits,
          byDoctor,
          byDepartment,
          byReferralSource: byReferralSource.map((r: any) => ({ source: r.referralSource, count: r.count })),
          byReferralArea: byReferralArea.map((r: any) => ({ area: r.area, count: r.count })),
        },
        labOrders: {
          totalOrders: byTest.reduce((s: number, r: any) => s + r.orders, 0),
          byTest,
        },
        billing: {
          cashByMode: cashCollected.rows,
          cashGrandTotal: cashCollected.grandTotal,
          billsByTypeStatus: dailyBills.rows,
          totalBills: dailyBills.totalBills,
          totalAmount: dailyBills.totalAmount,
          discount,
          cashFlow,
          timewiseSales,
        },
        pharmacy: {
          drugSales: drugSales.rows,
          totalQuantity: drugSales.totalQuantity,
          totalAmount: drugSales.totalAmount,
        },
      },
    },
    { upsert: true }
  );
}

export async function refreshFilterCache(tenantId: string) {
  const [investigationTypes, diagnoses] = await Promise.all([
    liveInvestigationTypes(tenantId),
    liveDiagnoses(tenantId),
  ]);
  await Promise.all([
    TenantFilterCache.findOneAndUpdate(
      { tenantId, key: "investigationTypes" },
      { $set: { values: investigationTypes, computedAt: new Date() } },
      { upsert: true }
    ),
    TenantFilterCache.findOneAndUpdate(
      { tenantId, key: "diagnoses" },
      { $set: { values: diagnoses, computedAt: new Date() } },
      { upsert: true }
    ),
  ]);
}

export interface RefreshAllOptions {
  scope: "today" | "finalize" | "backfill";
  from?: string; // required for "backfill"
  to?: string;   // required for "backfill"
}

// Enumerates active tenants and refreshes each, in bounded concurrent batches so one
// slow/failing tenant never blocks the rest and the job scales past today's handful
// of tenants without opening unbounded concurrent aggregations against shared Mongo.
export async function refreshAllTenants(opts: RefreshAllOptions) {
  const tenants = await Tenant.find({ status: { $in: ["trial", "active"] } }).select("_id settings.timezone");

  await inBatches(tenants, CONCURRENCY, async (tenant) => {
    const tenantId = String(tenant._id);
    const tz = (tenant as any).settings?.timezone || "Asia/Kolkata";

    let dates: string[];
    if (opts.scope === "today") {
      dates = [todayInTz(tz)];
    } else if (opts.scope === "finalize") {
      // Trailing 7-day window ending yesterday — self-heals late corrections to
      // recent history without hooking every mutation call site (see plan Part B3).
      const today = todayInTz(tz);
      dates = Array.from({ length: 7 }, (_, i) => addDaysStr(today, -(i + 1)));
    } else {
      if (!opts.from || !opts.to) throw new Error("backfill scope requires from/to");
      dates = daysBetween(opts.from, opts.to);
    }

    for (const dateStr of dates) {
      await refreshTenantDay(tenantId, dateStr, tz);
    }
    await refreshFilterCache(tenantId);
  });
}

function addDaysStr(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): string[] {
  const days: string[] = [];
  for (let d = fromStr; d <= toStr; d = addDaysStr(d, 1)) days.push(d);
  return days;
}
