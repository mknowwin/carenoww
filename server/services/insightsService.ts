import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import LabOrder from "../models/LabOrder.js";
import BillingRecord from "../models/BillingRecord.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";
import { CARDIOLOGY_TESTS } from "../lib/testCategories.js";

const oid = (tenantId: string) => new mongoose.Types.ObjectId(tenantId);

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

// #1 Doctor-wise visit/order counts
export async function getDoctorWise(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr } } },
    { $group: { _id: "$doctor", visits: { $sum: 1 } } },
    { $project: { _id: 0, doctor: "$_id", visits: 1 } },
    { $sort: { visits: -1 } },
  ]);
}

// #2 Department-wise visit counts
export async function getDepartmentWise(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr } } },
    { $group: { _id: "$department", visits: { $sum: 1 } } },
    { $project: { _id: 0, department: "$_id", visits: 1 } },
    { $sort: { visits: -1 } },
  ]);
}

// #3 Investigation-wise order counts
export async function getInvestigationWise(tenantId: string, tz: string, from?: string, to?: string) {
  const { start, end } = resolveDateRange(tz, from, to);
  return LabOrder.aggregate([
    { $match: { tenantId: oid(tenantId), ordered: { $gte: start, $lte: end } } },
    { $group: { _id: "$test", orders: { $sum: 1 } } },
    { $project: { _id: 0, test: "$_id", orders: 1 } },
    { $sort: { orders: -1 } },
  ]);
}

export interface CardiologyListFilters {
  from?: string;
  to?: string;
  doctor?: string;
  department?: string;
  diagnosis?: string;
  modality?: string;
}

// #4-8 Combined ECG/ECHO/TMT/Holter/ABP list with diagnosis
export async function getCardiologyList(tenantId: string, tz: string, filters: CardiologyListFilters) {
  const { start, end } = resolveDateRange(tz, filters.from, filters.to);
  const query: any = {
    tenantId,
    ordered: { $gte: start, $lte: end },
    test: { $regex: filters.modality ? escapeRegex(filters.modality) : CARDIOLOGY_TESTS.map(escapeRegex).join("|"), $options: "i" },
  };
  if (filters.doctor)     query.doctor = { $regex: escapeRegex(filters.doctor), $options: "i" };
  if (filters.department) query.department = { $regex: escapeRegex(filters.department), $options: "i" };
  if (filters.diagnosis)  query.diagnosis = filters.diagnosis;

  return LabOrder.find(query)
    .select("labId patientId patientName test doctor department ordered status diagnosis")
    .sort({ ordered: -1 });
}

// Distinct diagnosis values recorded for cardiology investigations, for the filter dropdown
export async function getCardiologyDiagnoses(tenantId: string) {
  const values = await LabOrder.distinct("diagnosis", {
    tenantId,
    test: { $regex: CARDIOLOGY_TESTS.map(escapeRegex).join("|"), $options: "i" },
    diagnosis: { $nin: [null, ""] },
  });
  return (values as string[]).sort((a, b) => a.localeCompare(b));
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// #10 Cash collected today, by payment mode
export async function getCashCollected(tenantId: string, tz: string, date?: string) {
  const { start, end } = resolveDateRange(tz, date, date);
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

// #11 Total bills generated per day, by type/status
export async function getDailyBillsCount(tenantId: string, tz: string, date?: string) {
  const { start, end } = resolveDateRange(tz, date, date);
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

// #12 Referrals by source (Doctor/VHN/Medical Shop/Lab/Self/Other)
export async function getReferralsBySource(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr }, referralSource: { $nin: [null, ""] } } },
    { $group: { _id: "$referralSource", count: { $sum: 1 } } },
    { $project: { _id: 0, referralSource: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

// #13 Referrals by geographical area
export async function getReferralsByArea(tenantId: string, tz: string, from?: string, to?: string) {
  const { fromStr, toStr } = resolveDateStrRange(tz, from, to);
  return Appointment.aggregate([
    { $match: { tenantId: oid(tenantId), date: { $gte: fromStr, $lte: toStr }, area: { $nin: [null, ""] } } },
    { $group: { _id: "$area", count: { $sum: 1 } } },
    { $project: { _id: 0, area: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

// #14 Return bill (Credit Note) summary
export async function getReturnBills(tenantId: string, tz: string, from?: string, to?: string) {
  const { start, end } = resolveDateRange(tz, from, to);
  const notes = await BillingRecord.find({
    tenantId, docType: "CreditNote", date: { $gte: start, $lte: end },
  }).select("billId originalBillNo patientName date amount cancelReason createdBy").sort({ date: -1 });
  const totalReturned = notes.reduce((s, n) => s + Math.abs(n.amount), 0);
  return { notes, totalReturned };
}

// #15 Timewise sales summary — hourly buckets for a single day
export async function getTimewiseSales(tenantId: string, tz: string, date?: string) {
  const { start, end } = resolveDateRange(tz, date, date);
  const rows = await BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId) } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: start, $lte: end } } },
    { $group: { _id: { $hour: { date: "$payments.paidAt", timezone: tz } }, total: { $sum: "$payments.amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, hour: "$_id", total: 1, count: 1 } },
    { $sort: { hour: 1 } },
  ]);
  // Fill all 24 hours so the UI can render a complete table even for quiet hours
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? { hour: h, total: 0, count: 0 });
}

// #16 Daywise discount summary
export async function getDiscountDaywise(tenantId: string, tz: string, from?: string, to?: string) {
  const { start, end } = resolveDateRange(tz, from, to);
  return BillingRecord.aggregate([
    { $match: { tenantId: oid(tenantId), docType: "Bill", date: { $gte: start, $lte: end }, discount: { $gt: 0 } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: tz } }, totalDiscount: { $sum: "$discount" }, bills: { $sum: 1 } } },
    { $project: { _id: 0, day: "$_id", totalDiscount: 1, bills: 1 } },
    { $sort: { day: 1 } },
  ]);
}

// #17 Billwise discount summary — flat list, one row per discounted bill
export async function getDiscountBillwise(tenantId: string, tz: string, from?: string, to?: string) {
  const { start, end } = resolveDateRange(tz, from, to);
  return BillingRecord.find({
    tenantId, docType: "Bill", date: { $gte: start, $lte: end }, discount: { $gt: 0 },
  }).select("billId patientName date amount discount discountType discountPercent createdBy").sort({ date: -1 });
}

// #18 Day IN-OUT cash flow summary (net collections, plus cancelled bills for visibility)
export async function getCashFlow(tenantId: string, tz: string, date?: string) {
  const { start, end } = resolveDateRange(tz, date, date);

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
