import mongoose from "mongoose";
import DrugInventory from "../models/DrugInventory.js";
import DrugBatch from "../models/DrugBatch.js";

export async function syncDrugStock(tenantId: string, drugId: string) {
  const agg = await DrugBatch.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), drugId: new mongoose.Types.ObjectId(drugId), status: "Active" } },
    { $group: { _id: null, total: { $sum: "$quantityRemaining" } } },
  ]);
  const stock = agg[0]?.total ?? 0;
  const drug = await DrugInventory.findById(drugId);
  if (!drug) return;
  const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
  const ratio = stock / reorderLevel;
  const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
  await DrugInventory.findByIdAndUpdate(drugId, { $set: { stock, status } });
}

export async function fefoDeduct(
  tenantId: string,
  drugId: string,
  quantity: number
): Promise<Array<{ batchId: mongoose.Types.ObjectId; batchNo: string; deducted: number; mrpPerUnit: number }>> {
  const batches = await DrugBatch.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    drugId: new mongoose.Types.ObjectId(drugId),
    status: "Active",
    quantityRemaining: { $gt: 0 },
  }).sort({ expiryDate: 1 });

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
    });
    used.push({ batchId: batch._id as mongoose.Types.ObjectId, batchNo: batch.batchNo, deducted: take, mrpPerUnit: batch.mrpPerUnit ?? 0 });
    remaining -= take;
  }

  return used;
}
