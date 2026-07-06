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
  const { drugId, batchId, adjustmentType, quantityAdjusted, reason, expiryDate } = body;

  if (!drugId || !adjustmentType || quantityAdjusted === undefined || !reason) {
    throw AppError.badRequest("drugId, adjustmentType, quantityAdjusted, and reason are required");
  }

  const drug = await DrugInventory.findOne({ _id: drugId, tenantId });
  if (!drug) throw AppError.notFound("Drug not found");

  // Additive adjustment (Opening-Stock / Count-Correction) with no existing
  // batch to attribute it to — needs a real batch, not a direct stock $set,
  // otherwise it's silently discarded the next time syncDrugStock recomputes
  // stock from batches (e.g. the next GRN or dispense).
  const isAdditiveNoBatch = !batchId && drug.isBatchTracked && Number(quantityAdjusted) > 0;
  if (isAdditiveNoBatch && !expiryDate) {
    throw AppError.badRequest(
      `"${drug.name}" is batch-tracked. Provide an expiry date for this added stock.`,
      { requiresOpeningExpiry: true, drugId, drugName: drug.name }
    );
  }

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

  // Apply the adjustment to the batch if specified, create a new batch for an
  // unattributed addition, or fall back to a direct inventory update.
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
  } else if (isAdditiveNoBatch) {
    await DrugBatch.create({
      tenantId,
      drugId,
      batchNo: adjustmentId, // already unique (getNextId "adj" counter) — no grnId collision risk
      supplierName: "Stock Adjustment",
      expiryDate: new Date(expiryDate),
      quantityReceived: Number(quantityAdjusted),
      quantityRemaining: Number(quantityAdjusted),
      status: "Active",
    });
    await syncDrugStock(tenantId, drugId);
  } else {
    // Non-batch-tracked drugs, and reductions without a batchId (Damage/
    // Expiry-Writeoff/Theft/Return-to-Supplier) — deliberately unchanged.
    // The reduction case has the same "silently overwritten by the next sync"
    // flaw for batch-tracked drugs, left out of scope per product decision;
    // it needs FEFO-ordered batch deduction, not a direct stock $set.
    const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
    const ratio = quantityAfter / reorderLevel;
    const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
    await DrugInventory.findByIdAndUpdate(drugId, { $set: { stock: quantityAfter, status } });
  }

  return adjustment;
}
