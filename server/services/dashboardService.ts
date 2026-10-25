import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import BillingRecord from "../models/BillingRecord.js";
import IPDAdmission from "../models/IPDAdmission.js";
import DrugInventory from "../models/DrugInventory.js";
import LabOrder from "../models/LabOrder.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";
import { canonicalNames } from "./referralMasterService.js";
import { listWards, bedTotals } from "./wardService.js";
import { icuFilter } from "./ipdService.js";


// Revenue for a date range, keyed on when cash actually moved (payments[].paidAt)
// rather than the bill's own creation date. A late payment recorded today on an
// old bill correctly credits today, not the old bill's month — and a Credit
// Note's refund entry (negative amount, paidAt = today) nets out today's
// collection the same way, with no separate "returns" handling needed.
async function revenueForRange(tenantId: string, start: Date, end: Date) {
  const agg = await BillingRecord.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: "$payments.amount" } } },
  ]);
  return agg[0]?.total || 0;
}

export async function getMetrics(tenantId: string, tz: string) {
  const today = todayInTz(tz);

  const [
    totalPatients,
    opdToday,
    ipdCurrent,
    icuCurrent,
    appointmentsToday,
    pendingClaims,
    criticalAlerts,
  ] = await Promise.all([
    Patient.countDocuments({ tenantId, isActive: true }),
    Appointment.countDocuments({ tenantId, date: today, status: { $in: ["Confirmed", "Waiting", "In Consult"] } }),
    IPDAdmission.countDocuments({ tenantId, status: "Active" }),
    IPDAdmission.countDocuments(await icuFilter(tenantId)),
    Appointment.countDocuments({ tenantId, date: today }),
    BillingRecord.countDocuments({ tenantId, status: { $in: ["Pending", "Partial"] } }),
    Patient.countDocuments({ tenantId, riskLevel: "Critical", isActive: true }),
  ]);

  const todayStart = startOfDayUtc(today, tz);
  const todayEnd   = endOfDayUtc(today, tz);
  const [todayY, todayM] = today.split("-").map(Number);
  const monthStart = startOfDayUtc(`${todayY}-${String(todayM).padStart(2, "0")}-01`, tz);
  const nextMonth  = todayM === 12 ? `${todayY + 1}-01-01` : `${todayY}-${String(todayM + 1).padStart(2, "0")}-01`;
  const monthEnd   = startOfDayUtc(nextMonth, tz);

  // Revenue — today and current month, keyed on payments[].paidAt (see revenueForRange)
  const [revenueToday, revenueMonth] = await Promise.all([
    revenueForRange(tenantId, todayStart, todayEnd),
    revenueForRange(tenantId, monthStart, monthEnd),
  ]);

  // Bed occupancy from the tenant's ward & bed master (0 when no beds are set up)
  const beds = await bedTotals(tenantId);
  const bedOccupancyRate = beds.total > 0 ? Math.round((beds.occupied / beds.total) * 100) : 0;

  return {
    totalPatients,
    opdToday,
    ipdCurrent,
    icuCurrent,
    appointmentsToday,
    pendingClaims,
    criticalAlerts,
    bedOccupancyRate,
    revenueToday,
    revenueMonth,
    surgeriesThisWeek: 0,
    avgLOS: await averageLengthOfStay(tenantId, tz),
  };
}

// Average length of stay (calendar days, same count as the IPD chart) for
// admissions discharged in the last 30 days; 0 when there were none
async function averageLengthOfStay(tenantId: string, tz: string) {
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await IPDAdmission.find({ tenantId, status: "Discharged", dischargeDate: { $gte: since } })
    .select("admissionDate dischargeDate").lean();
  if (rows.length === 0) return 0;
  const day = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d));
  const total = rows.reduce((s, r) => s + Math.round((day(r.dischargeDate!) - day(r.admissionDate)) / 86400000) + 1, 0);
  return Math.round((total / rows.length) * 10) / 10;
}

export async function getBedOccupancy(tenantId: string) {
  const wards = await listWards(tenantId);
  return wards.map((w) => ({
    ward:      w.name,
    total:     w.counts.total,
    occupied:  w.counts.occupied,
    available: w.counts.total - w.counts.occupied,
  }));
}

export async function getAiAlerts(tenantId: string) {
  const alerts: any[] = [];

  // Critical patients
  const criticalPatients = await Patient.find({ tenantId, riskLevel: "Critical", isActive: true }).limit(2);
  criticalPatients.forEach((p) => {
    alerts.push({
      id: `alert-${p._id}`,
      type: "critical",
      module: p.status,
      patient: `${p.name} (${p.uhid})`,
      message: `Critical patient alert: ${p.diagnosis}`,
      time: "Now",
      action: "Review Now",
    });
  });

  // Drug critical stock
  const criticalDrugs = await DrugInventory.find({ tenantId, status: "Critical" }).limit(2);
  criticalDrugs.forEach((d) => {
    alerts.push({
      id: `drug-${d._id}`,
      type: "warning",
      module: "Pharmacy",
      patient: null,
      message: `Stock-out alert: ${d.name} below critical threshold (${d.stock} ${d.unit})`,
      time: "Now",
      action: "Order Now",
    });
  });

  // Pending lab STAT orders
  const statOrders = await LabOrder.find({ tenantId, priority: "STAT", status: { $in: ["Pending", "Processing"] } }).limit(2);
  statOrders.forEach((o) => {
    alerts.push({
      id: `lab-${o._id}`,
      type: "warning",
      module: "Lab",
      patient: `${o.patientName} (${o.patientId})`,
      message: `STAT order pending: ${o.test} — awaiting results`,
      time: "Now",
      action: "Check Lab",
    });
  });

  return alerts;
}

export async function getRevenueTrend(tenantId: string, tz: string) {
  const currentYear = todayInTz(tz).split("-")[0];
  const yearStart = startOfDayUtc(`${currentYear}-01-01`, tz);
  const yearEnd   = startOfDayUtc(`${Number(currentYear) + 1}-01-01`, tz);

  // Grouped by the month each payment/refund actually happened (payments[].paidAt),
  // not the bill's own creation date — see revenueForRange for why.
  const rawTrend = await BillingRecord.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: yearStart, $lt: yearEnd } } },
    { $group: { _id: { month: { $month: "$payments.paidAt" }, type: "$type" }, total: { $sum: "$payments.amount" } } },
  ]);

  // Build month buckets Jan → current month
  const currentMonthNum = Number(todayInTz(tz).split("-")[1]);
  const monthMap: Record<number, { opd: number; ipd: number; pharmacy: number; other: number }> = {};
  for (let m = 1; m <= currentMonthNum; m++) monthMap[m] = { opd: 0, ipd: 0, pharmacy: 0, other: 0 };
  for (const row of rawTrend) {
    const m = row._id.month as number;
    if (!monthMap[m]) continue;
    if      (row._id.type === "OPD")      monthMap[m].opd      += row.total;
    else if (row._id.type === "IPD")      monthMap[m].ipd      += row.total;
    else if (row._id.type === "Pharmacy") monthMap[m].pharmacy += row.total;
    else                                  monthMap[m].other    += row.total;
  }

  return Object.entries(monthMap).map(([m, v]) => {
    const label = new Date(Number(currentYear), Number(m) - 1, 1).toLocaleString("default", { month: "short" });
    return { month: label, opd: v.opd, ipd: v.ipd + v.other, pharmacy: v.pharmacy };
  });
}

export async function getDeptVolume(tenantId: string, tz: string) {
  const todayDate = todayInTz(tz);
  return Appointment.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), date: todayDate } },
    { $group: { _id: "$department", patients: { $sum: 1 } } },
    { $project: { _id: 0, name: "$_id", patients: 1 } },
    { $sort: { patients: -1 } },
    { $limit: 8 },
  ]);
}

// Name-wise referral report per type. Each type maps to the appointment field
// holding the name, the referralSource it belongs to, and its master list.
const REFERRAL_STATS_TYPES = {
  "doctor":       { field: "referringDoctor", source: "Doctor",       master: "Doctor" },
  "vhn":          { field: "referralDetail",  source: "VHN",          master: "VHN" },
  "area":         { field: "area",            source: null,           master: "Area" },
  "medical-shop": { field: "referralDetail",  source: "Medical Shop", master: "Medical Shop" },
  "lab":          { field: "referralDetail",  source: "Lab",          master: "Lab" },
  "other":        { field: "referralDetail",  source: "Other",        master: "Other" },
} as const;
export type ReferralStatsBy = keyof typeof REFERRAL_STATS_TYPES;
export const REFERRAL_STATS_BY = Object.keys(REFERRAL_STATS_TYPES) as ReferralStatsBy[];

export const UNSPECIFIED_REFERRER = "(Unspecified)";

// Counts by visit `date` (not booking time) and skips cancelled appointments, so
// totals line up with the Insights referral reports. Names differing only in case
// or spacing merge into one row, labelled with the master spelling when there is one.
export async function getReferralStats(tenantId: string, tz: string, month?: string, by: ReferralStatsBy = "doctor") {
  // Parse ?month=YYYY-MM, default to current month
  let year: number, mon: number;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, mon] = month.split("-").map(Number);
  } else {
    [year, mon] = todayInTz(tz).split("-").map(Number);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad(mon)}-01`;
  const nextMonth  = mon === 12 ? `${year + 1}-01-01` : `${year}-${pad(mon + 1)}-01`;

  const { field, source, master } = REFERRAL_STATS_TYPES[by];
  // Doctor referrals booked before the Referral Source dropdown have no source set.
  const sourceMatch = by === "doctor"
    ? { $or: [{ referralSource: "Doctor" }, { referringDoctor: { $nin: [null, ""] } }] }
    : source ? { referralSource: source } : { [field]: { $nin: [null, ""] } };

  const groups: { names: string[]; count: number }[] = await Appointment.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        date: { $gte: monthStart, $lt: nextMonth },
        status: { $ne: "Cancelled" },
        ...sourceMatch,
      },
    },
    { $project: { name: { $trim: { input: { $ifNull: [`$${field}`, ""] } } } } },
    // Area has no "unnamed" bucket — no area means it isn't an area referral.
    ...(source ? [] : [{ $match: { name: { $ne: "" } } }]),
    { $group: { _id: { $toLower: "$name" }, names: { $push: "$name" }, count: { $sum: 1 } } },
    { $project: { _id: 0, names: 1, count: 1 } },
  ]);

  const canonical = await canonicalNames(tenantId, master);
  return groups
    .map(({ names, count }) => {
      const typed = mostCommon(names);
      const name = typed === "" ? UNSPECIFIED_REFERRER : canonical.get(typed.toLowerCase()) ?? typed;
      return { name, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function mostCommon(values: string[]): string {
  const tally = new Map<string, number>();
  let best = values[0] ?? "", bestN = 0;
  for (const v of values) {
    const n = (tally.get(v) ?? 0) + 1;
    tally.set(v, n);
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}
