import mongoose from "mongoose";
import PharmacyOrder from "../models/PharmacyOrder.js";
import { getNextId } from "../lib/counter.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
import { checkPharmacyStock, deductAndExpandPharmacyItems } from "./billingService.js";
import { AppError } from "../lib/AppError.js";

export interface PharmacyOrderListFilters {
  status?: string;
  patientId?: string;
  rxSource?: string;
  page?: string;
  limit?: string;
}

export async function listOrders(tenantId: string, filters: PharmacyOrderListFilters) {
  const { status, patientId, rxSource, page = "1", limit = "50" } = filters;
  const query: any = { tenantId };
  if (status)    query.status    = status;
  if (patientId) query.patientId = patientId;
  if (rxSource)  query.rxSource  = rxSource;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [orders, total] = await Promise.all([
    PharmacyOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    PharmacyOrder.countDocuments(query),
  ]);
  return { orders, total };
}

// Builds Pharmacy bill line items from dispensed order items, carrying drugId/
// batchNo through so checkPharmacyStock/deductAndExpandPharmacyItems can
// recognize them as real inventory draws.
function buildBillItems(dispensedItems: any[]) {
  return dispensedItems
    .filter((it: any) => it.drugId || it.drugName)
    .map((it: any) => ({
      description: it.drugName || "Drug",
      drugName:    it.drugName || "",
      category:    "Pharmacy" as const,
      quantity:    it.quantity || 1,
      unitPrice:   it.mrpPerUnit ?? 0,
      total:       (it.quantity || 1) * (it.mrpPerUnit ?? 0),
      drugId:      it.drugId,
      batchNo:     it.batchNo || "",
    }));
}

// Create order (digital auto-order OR manual counter/paper-Rx).
// Immediate-dispense (OTC counter sale, status: "Dispensed" with items) checks
// and deducts stock atomically with order creation and auto-billing, exactly
// like updateOrder's dispense transition below — blocking entirely if any
// item's requested quantity exceeds available stock.
export async function createOrder(tenantId: string, userName: string, body: Record<string, any>) {
  const {
    patientId, patientName, drug, qty, unit,
    items, type, doctor, time, prescriptionId,
    rxSource = "Digital", paperRxNote = "", notes,
    status: reqStatus,
  } = body;

  if (!patientId || !patientName) {
    throw AppError.badRequest("patientId and patientName are required");
  }
  if (!type) throw AppError.badRequest("type (OPD/IPD/ICU) is required");

  // Build legacy drug summary from items if drug not explicitly provided
  const drugSummary = drug || (Array.isArray(items) && items.length
    ? items.map((it: any) => it.drugName).join(", ")
    : "");
  const totalQty = qty ?? (Array.isArray(items) ? items.reduce((s: number, it: any) => s + (it.quantity || 1), 0) : 0);

  const rxId = await getNextId(tenantId, "rx", "RX-");

  const orderData: any = {
    tenantId,
    rxId,
    patientId,
    patientName,
    drug: drugSummary,
    qty: totalQty,
    unit: unit || "units",
    items: items || [],
    type,
    rxSource,
    paperRxNote,
    doctor: doctor || "",
    time: time || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    prescriptionId: prescriptionId || undefined,
    notes: notes || "",
    status: reqStatus || "Pending",
  };

  const isImmediateDispense = reqStatus === "Dispensed" && Array.isArray(items) && items.length > 0;
  if (!isImmediateDispense) {
    return PharmacyOrder.create(orderData);
  }

  orderData.dispensedBy = userName;
  orderData.dispensedAt = new Date();

  const billItems = buildBillItems(items);
  const pharmacyItems = billItems.filter((it) => it.drugId);

  const session = await mongoose.startSession();
  let order: any;
  let autoBill: { billId: string } | undefined;
  try {
    await session.withTransaction(async () => {
      if (pharmacyItems.length) {
        const shortages = await checkPharmacyStock(tenantId, pharmacyItems, session);
        if (shortages.length) {
          throw AppError.conflict("Insufficient stock for one or more items", { shortages });
        }
      }

      const [created] = await PharmacyOrder.create([orderData], { session });
      order = created;

      if (billItems.length) {
        const expandedItems = await deductAndExpandPharmacyItems(tenantId, billItems, session);
        const bill = await createOrAppendBill({
          tenantId,
          patientId,
          patientName,
          items:     expandedItems,
          type:      "Pharmacy",
          createdBy: userName,
        }, session);
        autoBill = { billId: (bill as any).billId };
      }
    });
  } catch (err: any) {
    if (err.insufficientStock) {
      throw AppError.conflict("Insufficient stock for one or more items", {
        shortages: [{ drugId: err.drugId, available: err.available }],
      });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return { ...order.toObject(), autoBill };
}

// Update status / dispense. Dispensing checks and deducts FEFO stock and
// auto-bills atomically with the status transition, rejecting (409) if
// requested quantities exceed available stock — no status change, no stock
// touched, no bill created on a shortage.
export async function updateOrder(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const order = await PharmacyOrder.findOne({ _id: id, tenantId });
  if (!order) throw AppError.notFound("Order not found");

  const allowed = ["status", "dispensedBy", "dispensedAt", "notes", "items"];
  const update: any = {};
  allowed.forEach((k) => { if (body[k] !== undefined) update[k] = body[k]; });

  const isDispensing = update.status === "Dispensed" && order.status !== "Dispensed";

  if (!isDispensing) {
    const updated = await PharmacyOrder.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: update },
      { new: true }
    );
    return { ...(updated?.toObject() ?? {}) };
  }

  update.dispensedBy = update.dispensedBy || userName;
  update.dispensedAt = update.dispensedAt || new Date();

  const dispensedItems: any[] = update.items?.length ? update.items : order.items;
  const billItems = buildBillItems(dispensedItems);
  const pharmacyItems = billItems.filter((it) => it.drugId);

  const session = await mongoose.startSession();
  let updated: any;
  let autoBill: { billId: string } | undefined;
  try {
    await session.withTransaction(async () => {
      if (pharmacyItems.length) {
        const shortages = await checkPharmacyStock(tenantId, pharmacyItems, session);
        if (shortages.length) {
          throw AppError.conflict("Insufficient stock for one or more items", { shortages });
        }
      }

      updated = await PharmacyOrder.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: update },
        { new: true, session }
      );

      if (billItems.length) {
        const expandedItems = await deductAndExpandPharmacyItems(tenantId, billItems, session);
        const bill = await createOrAppendBill({
          tenantId,
          patientId:   order.patientId,
          patientName: order.patientName,
          items:       expandedItems,
          type:        "Pharmacy",
          createdBy:   userName,
        }, session);
        autoBill = { billId: (bill as any).billId };
      }
    });
  } catch (err: any) {
    if (err.insufficientStock) {
      throw AppError.conflict("Insufficient stock for one or more items", {
        shortages: [{ drugId: err.drugId, available: err.available }],
      });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return { ...(updated?.toObject() ?? {}), autoBill };
}
