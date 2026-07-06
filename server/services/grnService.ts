import GRN from "../models/GRN.js";
import DrugBatch from "../models/DrugBatch.js";
import DrugInventory from "../models/DrugInventory.js";
import InventoryAuditLog from "../models/InventoryAuditLog.js";
import { getNextId } from "../lib/counter.js";
import { syncDrugStock } from "../lib/fefo.js";
import { AppError } from "../lib/AppError.js";

export interface GRNListFilters {
  status?: string;
  page?: string;
  limit?: string;
}

export async function listGRNs(tenantId: string, filters: GRNListFilters) {
  const { status, page = "1", limit = "50" } = filters;
  const query: any = { tenantId };
  if (status) query.status = status;
  else query.status = { $nin: ["Cancelled"] };
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [grns, total] = await Promise.all([
    GRN.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    GRN.countDocuments(query),
  ]);
  return { grns, total };
}

export async function getGRN(tenantId: string, id: string) {
  const grn = await GRN.findOne({ _id: id, tenantId });
  if (!grn) throw AppError.notFound("GRN not found");
  return grn;
}

// Create GRN, create DrugBatch docs, update inventory
export async function createGRN(tenantId: string, userName: string, body: Record<string, any>) {
  const { supplierName, invoiceNo, invoiceDate, receivedDate, items, notes, status = "Received" } = body;

  if (!supplierName || !Array.isArray(items) || items.length === 0) {
    throw AppError.badRequest("supplierName and items[] are required");
  }

  const grnId = await getNextId(tenantId, "grn", "GRN-");
  const totalValue = items.reduce((s: number, it: any) => s + (it.totalCost || 0), 0);

  let grn;
  try {
    grn = await GRN.create({
      tenantId,
      grnId,
      supplierName,
      invoiceNo: invoiceNo || "",
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      receivedBy: userName,
      items,
      totalValue,
      status,
      notes: notes || "",
    });
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Batch number already exists");
    throw err;
  }

  // Create DrugBatch records and update inventory for each item
  if (status === "Received") {
    for (const item of items) {
      if (!item.drugId || !item.batchNo || !item.expiryDate || !item.quantityReceived) continue;

      await DrugBatch.create({
        tenantId,
        drugId: item.drugId,
        batchNo: item.batchNo,
        supplierName,
        expiryDate: new Date(item.expiryDate),
        quantityReceived: item.quantityReceived,
        quantityRemaining: item.quantityReceived,
        purchasePricePerUnit: item.purchasePricePerUnit || 0,
        mrpPerUnit: item.mrpPerUnit || 0,
        grnId: grn._id,
        status: "Active",
      });

      // Mark drug as batch-tracked and sync stock
      await DrugInventory.findByIdAndUpdate(item.drugId, { $set: { isBatchTracked: true } });
      await syncDrugStock(tenantId, item.drugId);
    }
  }

  return grn;
}

// Update GRN (Draft → Received triggers batch creation)
export async function updateGRN(tenantId: string, id: string, body: Record<string, any>) {
  const grn = await GRN.findOne({ _id: id, tenantId });
  if (!grn) throw AppError.notFound("GRN not found");

  const wasReceived = grn.status === "Received";
  const becomeReceived = body.status === "Received" && !wasReceived;

  const updated = await GRN.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: body },
    { new: true }
  );

  // If transitioning Draft → Received, create batches now
  if (becomeReceived && updated) {
    for (const item of updated.items) {
      if (!item.drugId || !item.batchNo || !item.quantityReceived) continue;
      await DrugBatch.create({
        tenantId,
        drugId: item.drugId,
        batchNo: item.batchNo,
        supplierName: updated.supplierName,
        expiryDate: item.expiryDate,
        quantityReceived: item.quantityReceived,
        quantityRemaining: item.quantityReceived,
        purchasePricePerUnit: item.purchasePricePerUnit || 0,
        mrpPerUnit: item.mrpPerUnit || 0,
        grnId: updated._id,
        status: "Active",
      });
      await DrugInventory.findByIdAndUpdate(item.drugId, { $set: { isBatchTracked: true } });
      await syncDrugStock(tenantId, item.drugId.toString());
    }
  }

  return updated;
}

// Cancel a GRN, reversing its stock impact if it was Received
export async function cancelGRN(tenantId: string, userName: string, id: string) {
  const grn = await GRN.findOne({ _id: id, tenantId });
  if (!grn) throw AppError.notFound("GRN not found");
  if (grn.status === "Cancelled") throw AppError.conflict("GRN is already cancelled");

  if (grn.status === "Received") {
    // Locate the batch each item created, and refuse if any has already been (partially) dispensed/adjusted
    const batches = await Promise.all(
      grn.items.map((item) => DrugBatch.findOne({ tenantId, grnId: grn._id, drugId: item.drugId, batchNo: item.batchNo }))
    );

    for (let i = 0; i < grn.items.length; i++) {
      const item = grn.items[i];
      const batch = batches[i];
      if (batch && batch.quantityRemaining < item.quantityReceived) {
        throw AppError.conflict(
          `Cannot cancel: stock from batch ${item.batchNo} has already been dispensed. Use a Stock Adjustment to correct instead.`
        );
      }
    }

    const affectedDrugIds = new Set<string>();
    for (let i = 0; i < grn.items.length; i++) {
      const batch = batches[i];
      if (!batch) continue;
      await DrugBatch.findByIdAndUpdate(batch._id, { $set: { quantityRemaining: 0, status: "Cancelled" } });
      affectedDrugIds.add(grn.items[i].drugId.toString());
    }

    for (const drugId of affectedDrugIds) {
      const before = (await DrugInventory.findById(drugId))?.stock ?? 0;
      await syncDrugStock(tenantId, drugId);
      const after = (await DrugInventory.findById(drugId))?.stock ?? 0;
      await InventoryAuditLog.create({
        tenantId,
        drugId,
        action: "Updated",
        changes: [{ field: "stock", oldValue: before, newValue: after }],
        performedBy: userName,
        notes: `Reversed by GRN ${grn.grnId} cancellation`,
      });
    }
  }

  grn.status = "Cancelled";
  await grn.save();

  return { message: "GRN cancelled" };
}
