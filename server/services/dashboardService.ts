import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import BillingRecord from "../models/BillingRecord.js";
import IPDAdmission from "../models/IPDAdmission.js";
import DrugInventory from "../models/DrugInventory.js";
import LabOrder from "../models/LabOrder.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";

const WARD_CAPACITY: Record<string, number> = {
  "General Ward": 80,
  "ICU": 20,
  "Private Ward": 30,
  "Semi-Private": 20,
  "Obs/Gyn": 15,
  "Pediatric": 20,
};

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
    IPDAdmission.countDocuments({ tenantId, status: "Active", ward: "ICU" }),
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

  // Revenue aggregations — today and current month, both using bill `date` field
  const [todayRevAgg, monthRevAgg] = await Promise.all([
    BillingRecord.aggregate([
      { $match: { tenantId, date: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: null, total: { $sum: "$paid" } } },
    ]),
    BillingRecord.aggregate([
      { $match: { tenantId, date: { $gte: monthStart, $lt: monthEnd } } },
      { $group: { _id: null, total: { $sum: "$paid" } } },
    ]),
  ]);

  // Bed occupancy rate from live IPD admissions
  const activeAdmissions = await IPDAdmission.find({ tenantId, status: "Active" });
  const totalBeds = Object.values(WARD_CAPACITY).reduce((s, n) => s + n, 0);
  const occupiedBeds = activeAdmissions.length;
  const bedOccupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  return {
    totalPatients,
    opdToday,
    ipdCurrent,
    icuCurrent,
    appointmentsToday,
    pendingClaims,
    criticalAlerts,
    bedOccupancyRate,
    revenueToday: todayRevAgg[0]?.total || 0,
    revenueMonth: monthRevAgg[0]?.total || 0,
    surgeriesThisWeek: 0,
    avgLOS: 4.2,
  };
}

export async function getBedOccupancy(tenantId: string) {
  const active = await IPDAdmission.find({ tenantId, status: "Active" });
  const wardCounts: Record<string, number> = {};
  active.forEach((a) => { wardCounts[a.ward] = (wardCounts[a.ward] || 0) + 1; });

  return Object.entries(WARD_CAPACITY).map(([ward, total]) => ({
    ward,
    total,
    occupied: wardCounts[ward] || 0,
    available: total - (wardCounts[ward] || 0),
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

  // Single aggregation grouped by bill date month + type (1 query instead of 4×months)
  // Uses `date` (business bill date) not `createdAt` (insert timestamp)
  const rawTrend = await BillingRecord.aggregate([
    { $match: { tenantId, date: { $gte: yearStart, $lt: yearEnd } } },
    { $group: { _id: { month: { $month: "$date" }, type: "$type" }, total: { $sum: "$paid" } } },
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
    { $match: { tenantId, date: todayDate } },
    { $group: { _id: "$department", patients: { $sum: 1 } } },
    { $project: { _id: 0, name: "$_id", patients: 1 } },
    { $sort: { patients: -1 } },
    { $limit: 8 },
  ]);
}

export async function getReferralStats(tenantId: string, tz: string, month?: string) {
  // Parse ?month=YYYY-MM, default to current month
  let year: number, mon: number;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, mon] = month.split("-").map(Number);
  } else {
    [year, mon] = todayInTz(tz).split("-").map(Number);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const startOfMonth     = startOfDayUtc(`${year}-${pad(mon)}-01`, tz);
  const nextMonthStr     = mon === 12 ? `${year + 1}-01-01` : `${year}-${pad(mon + 1)}-01`;
  const startOfNextMonth = startOfDayUtc(nextMonthStr, tz);

  const appts = await Appointment.find({
    tenantId,
    referringDoctor: { $exists: true, $ne: "" },
    createdAt: { $gte: startOfMonth, $lt: startOfNextMonth },
  }).select("referringDoctor");

  const grouped: Record<string, number> = {};
  for (const a of appts) {
    const dr = (a as any).referringDoctor as string;
    grouped[dr] = (grouped[dr] || 0) + 1;
  }

  return Object.entries(grouped)
    .map(([referringDoctor, count]) => ({ referringDoctor, count }))
    .sort((a, b) => b.count - a.count);
}
