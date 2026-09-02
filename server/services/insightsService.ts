import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import LabOrder from "../models/LabOrder.js";
import BillingRecord from "../models/BillingRecord.js";
import TenantDailyRollup, { ITenantDailyRollup } from "../models/TenantDailyRollup.js";
import TenantFilterCache from "../models/TenantFilterCache.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";

const oid = (tenantId: string) => new mongoose.Types.ObjectId(tenantId);

// ── date helpers ────────────────────────────────────────────────────────────

// Appointment-scoped reports key on the appointment's own scheduled `date` string
// (YYYY-MM-DD), matching the existing getDeptVolume pattern — "which day the visit
// was for", not when the record happened to be created.
function resolveDateStrRange(tz: string, from?: string, to?: string) {
  const today = todayInTz(tz);
  const fromStr = from || today;
  const toStr = to || from || today;
  return { fromStr, toStr };
}

// BillingRecord/LabOrder-scoped reports key on real Date fields, so bounds are UTC instants.
function resolveDateRange(tz: string, from?: string, to?: string) {
  const today = todayInTz(tz);
  const fromStr = from || today;
  const toStr = to || from || today;
  return { start: startOfDayUtc(fromStr, tz), end: endOfDayUtc(toStr, tz) };
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

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sums numeric fields of rows sharing the same key value across however many
// source arrays (settled-rollup days + a live "today" tail) they came from.
function sumByKey<T extends Record<string, any>>(rows: T[], keyField: keyof T, sumFields: (keyof T)[]): T[] {
  const map = new Map<any, T>();
  for (const row of rows) {
    const k = row[keyField];
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...row });
    } else {
      for (const f of sumFields) (existing as any)[f] = (existing[f] as number) + (row[f] as number);
    }
  }
  return Array.from(map.values());
}

// ── settled/live split ──────────────────────────────────────────────────────
// Splits a requested [fromStr,toStr] range into a "settled" portion (strictly
// before today, safe to read from `status:"final"` rollups) and whether the
// range also needs a live tail for today. Never returns a settled portion that
// includes today — "provisional" rollup docs are never read by these functions.
interface SettledSplit {
  hasSettled: boolean;
  settledFrom?: string;
  settledTo?: string;
  hasLiveTail: boolean;
  today: string;
}
function splitSettledRange(tz: string, fromStr: string, toStr: string): SettledSplit {
  const today = todayInTz(tz);
  if (fromStr >= today) {
    return { hasSettled: false, hasLiveTail: true, today };
  }
  const settledTo = toStr < today ? toStr : addDaysStr(today, -1);
  return {
    hasSettled: true,
    settledFrom: fromStr,
    settledTo,
    hasLiveTail: toStr >= today,
    today,
  };
}

// Returns the "final" rollup docs covering every day in [settledFrom,settledTo], or
// null if any day in that span is missing a finalized rollup (bootstrap gap) — the
// caller falls back to a single full-range live query rather than partial merging.
async function getCompleteSettledRollups(tenantId: string, settledFrom: string, settledTo: string): Promise<ITenantDailyRollup[] | null> {
  const expected = daysBetween(settledFrom, settledTo);
  const docs = await TenantDailyRollup.find({
    tenantId, date: { $gte: settledFrom, $lte: settledTo }, status: "final",
  }).lean();
  if (docs.length !== expected.length) return null;
  return docs as unknown as ITenantDailyRollup[];
}

// ══ #1 Doctor-wise visit/order counts ═══════════════════════════════════════

async function liveDoctorWise(tenantId: string, fromStr: string, toStr: string) {
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr } } },
    { $group: { _id: "$doctor", visits: { $sum: 1 } } },
    { $project: { _id: 0, doctor: "$_id", visits: 1 } },
    { $sort: { visits: -1 } },
  ]);
}

export async function getDoctorWise(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  const split = splitSettledRange(tz, fromStr, toStr);
  if (!split.hasSettled) return liveDoctorWise(tenantId, fromStr, toStr);

  const rollups = await getCompleteSettledRollups(tenantId, split.settledFrom!, split.settledTo!);
  if (!rollups) return liveDoctorWise(tenantId, fromStr, toStr);

  const settledRows = rollups.flatMap((r) => r.appointments.byDoctor);
  const tail = split.hasLiveTail ? await liveDoctorWise(tenantId, split.today, split.today) : [];
  return sumByKey([...settledRows, ...tail], "doctor", ["visits"]).sort((a, b) => b.visits - a.visits);
}

// ══ #2 Department-wise visit counts ══════════════════════════════════════════

async function liveDepartmentWise(tenantId: string, fromStr: string, toStr: string) {
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr } } },
    { $group: { _id: "$department", visits: { $sum: 1 } } },
    { $project: { _id: 0, department: "$_id", visits: 1 } },
    { $sort: { visits: -1 } },
  ]);
}

export async function getDepartmentWise(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  const split = splitSettledRange(tz, fromStr, toStr);
  if (!split.hasSettled) return liveDepartmentWise(tenantId, fromStr, toStr);

  const rollups = await getCompleteSettledRollups(tenantId, split.settledFrom!, split.settledTo!);
  if (!rollups) return liveDepartmentWise(tenantId, fromStr, toStr);

  const settledRows = rollups.flatMap((r) => r.appointments.byDepartment);
  const tail = split.hasLiveTail ? await liveDepartmentWise(tenantId, split.today, split.today) : [];
  return sumByKey([...settledRows, ...tail], "department", ["visits"]).sort((a, b) => b.visits - a.visits);
}

// ══ #3 Investigation-wise order counts ═══════════════════════════════════════

async function liveInvestigationWise(tenantId: string, start: Date, end: Date) {
  return LabOrder.aggregate([
    { $match: { tenantId: oid(tenantId), ordered: { $gte: start, $lte: end } } },
    { $group: { _id: "$test", orders: { $sum: 1 } } },
    { $project: { _id: 0, test: "$_id", orders: 1 } },
    { $sort: { orders: -1 } },
  ]);
}

export async function getInvestigationWise(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  const split = splitSettledRange(tz, fromStr, toStr);
  if (!split.hasSettled) {
    const { start, end } = resolveDateRange(tz, fromStr, toStr);
    return liveInvestigationWise(tenantId, start, end);
  }

  const rollups = await getCompleteSettledRollups(tenantId, split.settledFrom!, split.settledTo!);
  if (!rollups) {
    const { start, end } = resolveDateRange(tz, fromStr, toStr);
    return liveInvestigationWise(tenantId, start, end);
  }

  const settledRows = rollups.flatMap((r) => r.labOrders.byTest);
  let tail: { test: string; orders: number }[] = [];
  if (split.hasLiveTail) {
    const { start, end } = resolveDateRange(tz, split.today, split.today);
    tail = await liveInvestigationWise(tenantId, start, end);
  }
  return sumByKey([...settledRows, ...tail], "test", ["orders"]).sort((a, b) => b.orders - a.orders);
}

// ══ #4-8 (generalized investigation list) ════════════════════════════════════

export interface InvestigationListFilters {
  from?: string;
  to?: string;
  doctor?: string;
  department?: string;
  diagnosis?: string;
  investigationTypes?: string[];
}

// Row-level detail — always live (see plan Part B2), just faster from the new indexes.
// investigationTypes, when given, narrows to lab orders whose `test` string contains ANY
// of the selected atomic names (test is free-text and sometimes comma-joined across
// several tests ordered together — see LabOrder.test); omitted, it covers every
// investigation recorded for the tenant.
export async function getInvestigationList(tenantId: string, tz: string, filters: InvestigationListFilters) {
  const { start, end } = resolveDateRange(tz, filters.from, filters.to);
  const query: any = {
    tenantId,
    ordered: { $gte: start, $lte: end },
  };
  if (filters.investigationTypes?.length) {
    query.test = { $regex: filters.investigationTypes.map(escapeRegex).join("|"), $options: "i" };
  }
  if (filters.doctor)     query.doctor = { $regex: escapeRegex(filters.doctor), $options: "i" };
  if (filters.department) query.department = { $regex: escapeRegex(filters.department), $options: "i" };
  if (filters.diagnosis)  query.diagnosis = filters.diagnosis;

  return LabOrder.find(query)
    .select("labId patientId patientName test doctor department ordered status diagnosis")
    .sort({ ordered: -1 });
}

// Distinct atomic investigation names recorded for the tenant, for the multi-select filter.
// Cached in TenantFilterCache (refreshed by the rollup cron); falls back to a live
// .distinct() scan (and opportunistically seeds the cache) if no cache doc exists yet.
export async function getInvestigationTypes(tenantId: string) {
  const cached = await TenantFilterCache.findOne({ tenantId, key: "investigationTypes" }).lean();
  if (cached) return cached.values;
  const values = await liveInvestigationTypes(tenantId);
  TenantFilterCache.findOneAndUpdate(
    { tenantId, key: "investigationTypes" },
    { $set: { values, computedAt: new Date() } },
    { upsert: true }
  ).catch(() => {}); // best-effort seed; never block the response on it
  return values;
}

export async function liveInvestigationTypes(tenantId: string) {
  const raw = await LabOrder.distinct("test", { tenantId, test: { $nin: [null, ""] } });
  const names = new Set<string>();
  for (const t of raw as string[]) {
    t.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => names.add(s));
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// Distinct diagnosis values recorded across all investigations, for the filter dropdown.
// Same cache-with-live-fallback treatment as getInvestigationTypes.
export async function getDiagnoses(tenantId: string) {
  const cached = await TenantFilterCache.findOne({ tenantId, key: "diagnoses" }).lean();
  if (cached) return cached.values;
  const values = await liveDiagnoses(tenantId);
  TenantFilterCache.findOneAndUpdate(
    { tenantId, key: "diagnoses" },
    { $set: { values, computedAt: new Date() } },
    { upsert: true }
  ).catch(() => {});
  return values;
}

export async function liveDiagnoses(tenantId: string) {
  const values = await LabOrder.distinct("diagnosis", { tenantId, diagnosis: { $nin: [null, ""] } });
  return (values as string[]).sort((a, b) => a.localeCompare(b));
}

// ══ #10 Cash collected, by payment mode ═══════════════════════════════════════

async function liveCashCollected(tenantId: string, start: Date, end: Date) {
  const rows = await BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId) } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: start, $lte: end } } },
    { $group: { _id: "$payments.paymentMode", total: { $sum: "$payments.amount" } } },
    { $project: { _id: 0, paymentMode: "$_id", total: 1 } },
    { $sort: { total: -1 } },
  ]);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { rows, grandTotal };
}

export async function getCashCollected(tenantId: string, tz: string, date?: string) {
  const dateStr = date || todayInTz(tz);
  const today = todayInTz(tz);
  if (dateStr < today) {
    const rollup = await TenantDailyRollup.findOne({ tenantId, date: dateStr, status: "final" }).lean();
    if (rollup) return { rows: rollup.billing.cashByMode, grandTotal: rollup.billing.cashGrandTotal };
  }
  const { start, end } = resolveDateRange(tz, dateStr, dateStr);
  return liveCashCollected(tenantId, start, end);
}

// ══ #11 Total bills generated per day, by type/status ═════════════════════════

async function liveDailyBillsCount(tenantId: string, start: Date, end: Date) {
  const rows = await BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId), docType: "Bill", date: { $gte: start, $lte: end } } },
    { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    { $project: { _id: 0, type: "$_id.type", status: "$_id.status", count: 1, amount: 1 } },
    { $sort: { type: 1, status: 1 } },
  ]);
  const totalBills = rows.reduce((s, r) => s + r.count, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, totalBills, totalAmount };
}

export async function getDailyBillsCount(tenantId: string, tz: string, date?: string) {
  const dateStr = date || todayInTz(tz);
  const today = todayInTz(tz);
  if (dateStr < today) {
    const rollup = await TenantDailyRollup.findOne({ tenantId, date: dateStr, status: "final" }).lean();
    if (rollup) return { rows: rollup.billing.billsByTypeStatus, totalBills: rollup.billing.totalBills, totalAmount: rollup.billing.totalAmount };
  }
  const { start, end } = resolveDateRange(tz, dateStr, dateStr);
  return liveDailyBillsCount(tenantId, start, end);
}

// ══ #12 Referrals by source ═══════════════════════════════════════════════════

async function liveReferralsBySource(tenantId: string, fromStr: string, toStr: string) {
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr }, referralSource: { $nin: [null, ""] } } },
    { $group: { _id: "$referralSource", count: { $sum: 1 } } },
    { $project: { _id: 0, referralSource: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

export async function getReferralsBySource(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  const split = splitSettledRange(tz, fromStr, toStr);
  if (!split.hasSettled) return liveReferralsBySource(tenantId, fromStr, toStr);

  const rollups = await getCompleteSettledRollups(tenantId, split.settledFrom!, split.settledTo!);
  if (!rollups) return liveReferralsBySource(tenantId, fromStr, toStr);

  const settledRows = rollups.flatMap((r) => r.appointments.byReferralSource.map((x) => ({ referralSource: x.source, count: x.count })));
  const tail = split.hasLiveTail ? await liveReferralsBySource(tenantId, split.today, split.today) : [];
  return sumByKey([...settledRows, ...tail], "referralSource", ["count"]).sort((a, b) => b.count - a.count);
}

// ══ #13 Referrals by geographical area ════════════════════════════════════════

async function liveReferralsByArea(tenantId: string, fromStr: string, toStr: string) {
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr }, area: { $nin: [null, ""] } } },
    { $group: { _id: "$area", count: { $sum: 1 } } },
    { $project: { _id: 0, area: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

export async function getReferralsByArea(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  const split = splitSettledRange(tz, fromStr, toStr);
  if (!split.hasSettled) return liveReferralsByArea(tenantId, fromStr, toStr);

  const rollups = await getCompleteSettledRollups(tenantId, split.settledFrom!, split.settledTo!);
  if (!rollups) return liveReferralsByArea(tenantId, fromStr, toStr);

  const settledRows = rollups.flatMap((r) => r.appointments.byReferralArea.map((x) => ({ area: x.area, count: x.count })));
  const tail = split.hasLiveTail ? await liveReferralsByArea(tenantId, split.today, split.today) : [];
  return sumByKey([...settledRows, ...tail], "area", ["count"]).sort((a, b) => b.count - a.count);
}

// ══ #14 Return bill (Credit Note) summary — row-level, always live ═══════════

export async function getReturnBills(tenantId: string, tz: string, from?: string, to?: string) {
  const { start, end } = resolveDateRange(tz, from, to);
  const notes = await BillingRecord.find({
    tenantId, docType: "CreditNote", date: { $gte: start, $lte: end },
  }).select("billId originalBillNo patientName date amount cancelReason createdBy").sort({ date: -1 });
  const totalReturned = notes.reduce((s, n) => s + Math.abs(n.amount), 0);
  return { notes, totalReturned };
}

// ══ #15 Timewise sales summary — hourly buckets for a single day ═════════════

async function liveTimewiseSales(tenantId: string, tz: string, start: Date, end: Date) {
  const rows = await BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId) } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: start, $lte: end } } },
    { $group: { _id: { $hour: { date: "$payments.paidAt", timezone: tz } }, total: { $sum: "$payments.amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, hour: "$_id", total: 1, count: 1 } },
    { $sort: { hour: 1 } },
  ]);
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? { hour: h, total: 0, count: 0 });
}

export async function getTimewiseSales(tenantId: string, tz: string, date?: string) {
  const dateStr = date || todayInTz(tz);
  const today = todayInTz(tz);
  if (dateStr < today) {
    const rollup = await TenantDailyRollup.findOne({ tenantId, date: dateStr, status: "final" }).lean();
    if (rollup) return rollup.billing.timewiseSales;
  }
  const { start, end } = resolveDateRange(tz, dateStr, dateStr);
  return liveTimewiseSales(tenantId, tz, start, end);
}

// ══ #16 Daywise discount summary ══════════════════════════════════════════════

async function liveDiscountDaywise(tenantId: string, tz: string, start: Date, end: Date) {
  return BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId), docType: "Bill", date: { $gte: start, $lte: end }, discount: { $gt: 0 } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: tz } }, totalDiscount: { $sum: "$discount" }, bills: { $sum: 1 } } },
    { $project: { _id: 0, day: "$_id", totalDiscount: 1, bills: 1 } },
    { $sort: { day: 1 } },
  ]);
}

export async function getDiscountDaywise(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  const split = splitSettledRange(tz, fromStr, toStr);
  if (!split.hasSettled) {
    const { start, end } = resolveDateRange(tz, fromStr, toStr);
    return liveDiscountDaywise(tenantId, tz, start, end);
  }

  const rollups = await getCompleteSettledRollups(tenantId, split.settledFrom!, split.settledTo!);
  if (!rollups) {
    const { start, end } = resolveDateRange(tz, fromStr, toStr);
    return liveDiscountDaywise(tenantId, tz, start, end);
  }

  // Each rollup doc is already one day — no cross-day summing needed, just one row per
  // day that actually had a discount, concatenated with today's live row if requested.
  const settledRows = rollups
    .filter((r) => r.billing.discount.bills > 0)
    .map((r) => ({ day: r.date, totalDiscount: r.billing.discount.totalDiscount, bills: r.billing.discount.bills }));
  let tail: { day: string; totalDiscount: number; bills: number }[] = [];
  if (split.hasLiveTail) {
    const { start, end } = resolveDateRange(tz, split.today, split.today);
    tail = await liveDiscountDaywise(tenantId, tz, start, end);
  }
  return [...settledRows, ...tail].sort((a, b) => a.day.localeCompare(b.day));
}

// ══ #17 Billwise discount summary — row-level, always live ═══════════════════

export async function getDiscountBillwise(tenantId: string, tz: string, from?: string, to?: string) {
  const { start, end } = resolveDateRange(tz, from, to);
  return BillingRecord.find({
    tenantId, docType: "Bill", date: { $gte: start, $lte: end }, discount: { $gt: 0 },
  }).select("billId patientName date amount discount discountType discountPercent createdBy").sort({ date: -1 });
}

// ══ #18 Day IN-OUT cash flow summary ══════════════════════════════════════════

async function liveCashFlow(tenantId: string, start: Date, end: Date) {
  const netAgg = await BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId) } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: start, $lte: end } } },
    { $group: { _id: "$docType", total: { $sum: "$payments.amount" } } },
  ]);
  const cashIn  = netAgg.find((r) => r._id === "Bill")?.total ?? 0;
  const cashOut = Math.abs(netAgg.find((r) => r._id === "CreditNote")?.total ?? 0);

  const cancelled = await BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId), status: "Cancelled", cancelledAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);

  return {
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    cancelledBills: cancelled[0]?.count ?? 0,
    cancelledAmount: cancelled[0]?.amount ?? 0,
  };
}

export async function getCashFlow(tenantId: string, tz: string, date?: string) {
  const dateStr = date || todayInTz(tz);
  const today = todayInTz(tz);
  if (dateStr < today) {
    const rollup = await TenantDailyRollup.findOne({ tenantId, date: dateStr, status: "final" }).lean();
    if (rollup) return rollup.billing.cashFlow;
  }
  const { start, end } = resolveDateRange(tz, dateStr, dateStr);
  return liveCashFlow(tenantId, start, end);
}

// ── exports used by rollupService.ts to compute one tenant-day's worth of every metric ──
export const _live = {
  doctorWise: liveDoctorWise,
  departmentWise: liveDepartmentWise,
  investigationWise: liveInvestigationWise,
  cashCollected: liveCashCollected,
  dailyBillsCount: liveDailyBillsCount,
  referralsBySource: liveReferralsBySource,
  referralsByArea: liveReferralsByArea,
  timewiseSales: liveTimewiseSales,
  cashFlow: liveCashFlow,
};
