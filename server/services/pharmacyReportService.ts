import mongoose from "mongoose";
import PharmacyOrder from "../models/PharmacyOrder.js";
import DrugInventory from "../models/DrugInventory.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";

const oid = (tenantId: string) => new mongoose.Types.ObjectId(tenantId);

// #9 Drug-wise day sales report — quantity + money, from dispensed order items
export async function getDrugSalesReport(tenantId: string, tz: string, date?: string) {
  const dateStr = date || todayInTz(tz);
  const start = startOfDayUtc(dateStr, tz);
  const end = endOfDayUtc(dateStr, tz);

  const rows = await PharmacyOrder.aggregate([
    { $match: { tenantId: oid(tenantId), status: "Dispensed", dispensedAt: { $gte: start, $lte: end } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.drugName", quantity: { $sum: "$items.quantity" }, amount: { $sum: "$items.totalAmount" } } },
    { $project: { _id: 0, drugName: "$_id", quantity: 1, amount: 1 } },
    { $sort: { amount: -1 } },
  ]);
  const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, totalQuantity, totalAmount };
}

// #20 Non-moving drug list — active drugs with no dispensed order within the window
export async function getNonMovingDrugs(tenantId: string, sinceDays: number) {
  const cutoff = new Date(Date.now() - sinceDays * 86_400_000);

  const recentAgg = await PharmacyOrder.aggregate([
    { $match: { tenantId: oid(tenantId), status: "Dispensed", dispensedAt: { $gte: cutoff } } },
    { $unwind: "$items" },
    { $match: { "items.drugId": { $exists: true, $ne: null } } },
    { $group: { _id: "$items.drugId" } },
  ]);
  const recentDrugIds = new Set(recentAgg.map((r) => String(r._id)));

  const lastDispensedAgg = await PharmacyOrder.aggregate([
    { $match: { tenantId: oid(tenantId), status: "Dispensed" } },
    { $unwind: "$items" },
    { $match: { "items.drugId": { $exists: true, $ne: null } } },
    { $group: { _id: "$items.drugId", lastDispensedAt: { $max: "$dispensedAt" } } },
  ]);
  const lastDispensedMap = new Map(lastDispensedAgg.map((r) => [String(r._id), r.lastDispensedAt]));

  const activeDrugs = await DrugInventory.find({ tenantId, isActive: { $ne: false } })
    .select("name category stock unit mrpPerUnit");

  return activeDrugs
    .filter((d) => !recentDrugIds.has(String(d._id)))
    .map((d) => ({
      _id: d._id,
      name: d.name,
      category: d.category,
      stock: d.stock,
      unit: d.unit,
      mrpPerUnit: d.mrpPerUnit,
      lastDispensedAt: lastDispensedMap.get(String(d._id)) || null,
    }))
    .sort((a, b) => {
      if (!a.lastDispensedAt && !b.lastDispensedAt) return 0;
      if (!a.lastDispensedAt) return -1;
      if (!b.lastDispensedAt) return 1;
      return new Date(a.lastDispensedAt).getTime() - new Date(b.lastDispensedAt).getTime();
    });
}
