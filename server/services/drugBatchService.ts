import DrugBatch from "../models/DrugBatch.js";
import InventoryAuditLog from "../models/InventoryAuditLog.js";
import { syncDrugStock } from "../lib/fefo.js";
import { AppError } from "../lib/AppError.js";

export async function listBatches(tenantId: string, drugId?: string) {
  const query: any = { tenantId };
  if (drugId) query.drugId = drugId;
  return DrugBatch.find(query).sort({ expiryDate: 1 });
}

// Fields editable via the batch-details edit form. Quantities are deliberately
// excluded — they must go through GRN (receiving) or Stock Adjustment so the
// derived DrugInventory.stock and the audit trail stay accurate.
const EDITABLE_BATCH_FIELDS = [
  "batchNo", "lotNo", "supplierName", "manufacturingDate", "expiryDate",
  "purchasePricePerUnit", "mrpPerUnit", "status",
] as const;

export async function updateBatch(tenantId: string, userName: string, batchId: string, body: Record<string, any>) {
  const current = await DrugBatch.findOne({ _id: batchId, tenantId });
  if (!current) throw AppError.notFound("Batch not found");

  const updates: Record<string, any> = {};
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  for (const key of EDITABLE_BATCH_FIELDS) {
    if (body[key] === undefined) continue;
    const newValue = key === "manufacturingDate" || key === "expiryDate"
      ? (body[key] ? new Date(body[key]) : undefined)
      : body[key];
    const oldValue = (current as any)[key];
    if (String(oldValue ?? "") !== String(newValue ?? "")) changes.push({ field: key, oldValue, newValue });
    updates[key] = newValue;
  }

  const batch = await DrugBatch.findOneAndUpdate(
    { _id: batchId, tenantId },
    { $set: updates },
    { new: true }
  );

  // Status changes (e.g. Active -> Quarantine) affect the sum-of-active-batches
  // stock derivation, so re-sync regardless of which fields changed.
  await syncDrugStock(tenantId, current.drugId.toString());

  if (changes.length > 0) {
    await InventoryAuditLog.create({
      tenantId,
      drugId: current.drugId,
      action: "Updated",
      changes,
      performedBy: userName,
      notes: `Batch ${current.batchNo} edited`,
    });
  }

  return batch;
}

export async function getExpiryReport(tenantId: string, expiryWithin = "90", includeExpired = "true") {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() + parseInt(expiryWithin));

  const dateQuery =
    includeExpired === "false"
      ? { $gte: now, $lte: cutoff }
      : { $lte: cutoff };

  return DrugBatch.aggregate([
    { $match: { tenantId, expiryDate: dateQuery } },
    {
      $lookup: {
        from: "druginventories",
        localField: "drugId",
        foreignField: "_id",
        as: "drug",
      },
    },
    { $unwind: { path: "$drug", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        batchNo:           1,
        expiryDate:        1,
        quantityRemaining: 1,
        mrpPerUnit:        1,
        status:            1,
        supplierName:      1,
        drugName:          "$drug.name",
        drugCategory:      "$drug.category",
        drugUnit:          "$drug.unit",
      },
    },
    { $sort: { expiryDate: 1 } },
  ]);
}
