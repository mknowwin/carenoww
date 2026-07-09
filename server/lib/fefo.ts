import mongoose from "mongoose";
import DrugInventory from "../models/DrugInventory.js";
import DrugBatch from "../models/DrugBatch.js";
import InventoryAuditLog from "../models/InventoryAuditLog.js";

export async function getAvailableStock(tenantId: string, drugId: string, session?: mongoose.ClientSession): Promise<number> {
  const drug = await DrugInventory.findOne({ _id: drugId, tenantId }).session(session ?? null);
  if (!drug) return 0;
  if (!drug.isBatchTracked) return drug.stock;

  const agg = await DrugBatch.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), drugId: new mongoose.Types.ObjectId(drugId), status: "Active" } },
    { $group: { _id: null, total: { $sum: "$quantityRemaining" } } },
  ]).session(session ?? null);
  return agg[0]?.total ?? 0;
}

// Carries a drug's pre-existing manual stock into a real batch the first time it
// transitions to batch tracking, so syncDrugStock's sum-of-batches doesn't silently
// discard stock that was never represented as a DrugBatch. No-ops once the drug is
// already batch-tracked (subsequent GRNs just add new batches normally).
export async function seedOpeningBatchIfNeeded(
  tenantId: string,
  drugId: string,
  openingExpiryDate: string | undefined,
  performedBy: string,
  session: mongoose.ClientSession
) {
  const drug = await DrugInventory.findOne({ _id: drugId, tenantId }).session(session);
  if (!drug || drug.isBatchTracked || drug.stock <= 0) return;

  if (!openingExpiryDate) {
    const err: any = new Error("Opening stock expiry required");
    err.requiresOpeningExpiry = true;
    err.drugId = drugId;
    err.drugName = drug.name;
    err.existingStock = drug.stock;
    throw err;
  }

  await DrugBatch.create([{
    tenantId,
    drugId,
    batchNo: "OPENING-BAL",
    supplierName: "Opening Balance",
    expiryDate: new Date(openingExpiryDate),
    quantityReceived: drug.stock,
    quantityRemaining: drug.stock,
    purchasePricePerUnit: drug.purchasePricePerUnit ?? 0,
    mrpPerUnit: drug.mrpPerUnit ?? 0,
    status: "Active",
  }], { session });

  // Traceable migration event, same pattern as the GRN-cancellation reversal log.
  await InventoryAuditLog.create([{
    tenantId,
    drugId,
    action: "Updated",
    changes: [{ field: "isBatchTracked", oldValue: false, newValue: true }],
    performedBy,
    notes: `Migrated ${drug.stock} pre-existing unit(s) to batch tracking as OPENING-BAL, expiry set to ${openingExpiryDate}`,
  }], { session });
}

export async function syncDrugStock(tenantId: string, drugId: string, session?: mongoose.ClientSession) {
  const agg = await DrugBatch.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), drugId: new mongoose.Types.ObjectId(drugId), status: "Active" } },
    { $group: { _id: null, total: { $sum: "$quantityRemaining" } } },
  ]).session(session ?? null);
  const stock = agg[0]?.total ?? 0;
  const drug = await DrugInventory.findById(drugId).session(session ?? null);
  if (!drug) return;
  const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
  const ratio = stock / reorderLevel;
  const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
  await DrugInventory.findByIdAndUpdate(drugId, { $set: { stock, status } }, { session });
}

export async function fefoDeduct(
  tenantId: string,
  drugId: string,
  quantity: number,
  session?: mongoose.ClientSession
): Promise<Array<{ batchId: mongoose.Types.ObjectId; batchNo: string; deducted: number; mrpPerUnit: number }>> {
  const batches = await DrugBatch.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    drugId: new mongoose.Types.ObjectId(drugId),
    status: "Active",
    quantityRemaining: { $gt: 0 },
  }).sort({ expiryDate: 1 }).session(session ?? null);

  const available = batches.reduce((s, b) => s + b.quantityRemaining, 0);
  if (available < quantity) {
    const err: any = new Error("Insufficient stock");
    err.insufficientStock = true;
    err.available = available;
    throw err;
  }

  let remaining = quantity;
  const used: Array<{ batchId: mongoose.Types.ObjectId; batchNo: string; deducted: number; mrpPerUnit: number }> = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityRemaining, remaining);
    const newQty = batch.quantityRemaining - take;
    await DrugBatch.findByIdAndUpdate(batch._id, {
      $set: {
        quantityRemaining: newQty,
        status: newQty === 0 ? "Exhausted" : "Active",
      },
    }, { session });
    used.push({ batchId: batch._id as mongoose.Types.ObjectId, batchNo: batch.batchNo, deducted: take, mrpPerUnit: batch.mrpPerUnit ?? 0 });
    remaining -= take;
  }

  return used;
}
