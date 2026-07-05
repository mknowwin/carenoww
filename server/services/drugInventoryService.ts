import DrugInventory from "../models/DrugInventory.js";
import InventoryAuditLog from "../models/InventoryAuditLog.js";
import StockAdjustment from "../models/StockAdjustment.js";
import GRN from "../models/GRN.js";
import { AppError } from "../lib/AppError.js";

// Prevents regex special chars in search input from being interpreted as regex operators
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface DrugInventoryListFilters {
  search?: string;
  status?: string;
  statusIn?: string;
  includeInactive?: string;
  page?: string;
  limit?: string;
}

export async function listDrugs(tenantId: string, filters: DrugInventoryListFilters) {
  const { search, status, statusIn, includeInactive, page = "1", limit = "20" } = filters;
  const query: any = { tenantId };
  // $ne: false (not === true) so drugs created before the isActive field existed still show up
  if (includeInactive !== "true") query.isActive = { $ne: false };
  if (search) {
    const escaped = escapeRegex(search);
    query.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { category: { $regex: escaped, $options: "i" } },
    ];
  }
  if (statusIn) query.status = { $in: statusIn.split(",") };
  else if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [drugs, total] = await Promise.all([
    DrugInventory.find(query).sort({ name: 1 }).skip(skip).limit(parseInt(limit)),
    DrugInventory.countDocuments(query),
  ]);
  return { drugs, total, page: parseInt(page), limit: parseInt(limit) };
}

export async function createDrug(tenantId: string, userName: string, body: Record<string, any>) {
  let drug;
  try {
    drug = await DrugInventory.create({ ...body, tenantId });
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Drug already exists in inventory");
    throw err;
  }
  await InventoryAuditLog.create({
    tenantId,
    drugId: drug._id,
    action: "Created",
    performedBy: userName,
  });
  return drug;
}

export async function updateDrug(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const current = await DrugInventory.findOne({ _id: id, tenantId });
  if (!current) throw AppError.notFound("Drug not found");

  const updates = { ...body };

  if (current.isBatchTracked && updates.stock !== undefined && Number(updates.stock) !== current.stock) {
    throw AppError.badRequest(
      "Stock for batch-tracked drugs is derived from batch quantities and cannot be edited directly. Use Stock Adjustment or GRN instead."
    );
  }

  // Only recompute status from stock if not batch-tracked (batch-tracked drugs use syncDrugStock)
  if (!current.isBatchTracked) {
    const stock        = updates.stock        ?? current.stock;
    const reorderLevel = updates.reorderLevel ?? current.reorderLevel;
    const ratio = reorderLevel > 0 ? stock / reorderLevel : 2;
    updates.status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
  }

  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  for (const key of Object.keys(body)) {
    const oldValue = (current as any)[key];
    const newValue = updates[key];
    if (oldValue === undefined) continue;
    if (String(oldValue) !== String(newValue)) changes.push({ field: key, oldValue, newValue });
  }

  const drug = await DrugInventory.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: updates },
    { new: true }
  );

  if (changes.length > 0) {
    await InventoryAuditLog.create({
      tenantId,
      drugId: current._id,
      action: "Updated",
      changes,
      performedBy: userName,
    });
  }

  return drug;
}

export async function deactivateDrug(tenantId: string, userName: string, id: string) {
  const drug = await DrugInventory.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!drug) throw AppError.notFound("Drug not found");
  await InventoryAuditLog.create({
    tenantId,
    drugId: drug._id,
    action: "Deactivated",
    performedBy: userName,
  });
  return { message: "Drug deactivated" };
}

export async function reactivateDrug(tenantId: string, userName: string, id: string) {
  const drug = await DrugInventory.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { isActive: true } },
    { new: true }
  );
  if (!drug) throw AppError.notFound("Drug not found");
  await InventoryAuditLog.create({
    tenantId,
    drugId: drug._id,
    action: "Reactivated",
    performedBy: userName,
  });
  return drug;
}

// Merged GRN + Adjustment + Edit timeline for one drug
export async function getDrugHistory(tenantId: string, drugId: string) {
  const [adjustments, auditLogs, grns] = await Promise.all([
    StockAdjustment.find({ tenantId, drugId }).sort({ createdAt: -1 }),
    InventoryAuditLog.find({ tenantId, drugId }).sort({ createdAt: -1 }),
    GRN.find({ tenantId, "items.drugId": drugId }).sort({ createdAt: -1 }),
  ]);

  const grnEntries = grns.flatMap((grn) =>
    grn.items
      .filter((it) => it.drugId.toString() === drugId)
      .map((it) => ({
        type: "GRN" as const,
        date: grn.receivedDate || grn.createdAt,
        grnId: grn.grnId,
        grnStatus: grn.status,
        receivedBy: grn.receivedBy,
        batchNo: it.batchNo,
        quantityReceived: it.quantityReceived,
        purchasePricePerUnit: it.purchasePricePerUnit,
        mrpPerUnit: it.mrpPerUnit,
      }))
  );

  const adjustmentEntries = adjustments.map((a) => ({
    type: "Adjustment" as const,
    date: a.createdAt,
    adjustmentId: a.adjustmentId,
    adjustmentType: a.adjustmentType,
    quantityBefore: a.quantityBefore,
    quantityAdjusted: a.quantityAdjusted,
    quantityAfter: a.quantityAfter,
    reason: a.reason,
    adjustedBy: a.adjustedBy,
  }));

  const editEntries = auditLogs.map((l) => ({
    type: "Edit" as const,
    date: l.createdAt,
    action: l.action,
    changes: l.changes,
    performedBy: l.performedBy,
    notes: l.notes,
  }));

  const history = [...grnEntries, ...adjustmentEntries, ...editEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { history };
}
