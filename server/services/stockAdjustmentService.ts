import StockAdjustment from "../models/StockAdjustment.js";
import DrugInventory from "../models/DrugInventory.js";
import DrugBatch from "../models/DrugBatch.js";
import { getNextId } from "../lib/counter.js";
import { syncDrugStock } from "../lib/fefo.js";
import { AppError } from "../lib/AppError.js";

export interface StockAdjustmentListFilters {
  drugId?: string;
  page?: string;
  limit?: string;
}

export async function listAdjustments(tenantId: string, filters: StockAdjustmentListFilters) {
  const { drugId, page = "1", limit = "50" } = filters;
  const query: any = { tenantId };
  if (drugId) query.drugId = drugId;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [adjustments, total] = await Promise.all([
    StockAdjustment.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    StockAdjustment.countDocuments(query),
  ]);
  return { adjustments, total };
}

export async function createAdjustment(tenantId: string, userName: string, body: Record<string, any>) {
  const { drugId, batchId, adjustmentType, quantityAdjusted, reason } = body;

  if (!drugId || !adjustmentType || quantityAdjusted === undefined || !reason) {
    throw AppError.badRequest("drugId, adjustmentType, quantityAdjusted, and reason are required");
  }

  const drug = await DrugInventory.findOne({ _id: drugId, tenantId });
  if (!drug) throw AppError.notFound("Drug not found");

  const quantityBefore = drug.stock;
  const quantityAfter  = Math.max(0, quantityBefore + Number(quantityAdjusted));

  const adjustmentId = await getNextId(tenantId, "adj", "ADJ-");

  const adjustment = await StockAdjustment.create({
    tenantId,
    adjustmentId,
    drugId,
    drugName: drug.name,
    batchId: batchId || undefined,
    adjustmentType,
    quantityBefore,
    quantityAdjusted: Number(quantityAdjusted),
    quantityAfter,
    reason,
    adjustedBy: userName,
  });

  // Apply the adjustment to the batch if specified, or directly to inventory
  if (batchId) {
    const batch = await DrugBatch.findOne({ _id: batchId, tenantId });
    if (batch) {
      const newBatchQty = Math.max(0, batch.quantityRemaining + Number(quantityAdjusted));
      await DrugBatch.findByIdAndUpdate(batchId, {
        $set: {
          quantityRemaining: newBatchQty,
          status: newBatchQty === 0 ? "Exhausted" : "Active",
        },
      });
    }
    await syncDrugStock(tenantId, drugId);
  } else {
    const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
    const ratio = quantityAfter / reorderLevel;
    const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
    await DrugInventory.findByIdAndUpdate(drugId, { $set: { stock: quantityAfter, status } });
  }

  return adjustment;
}
