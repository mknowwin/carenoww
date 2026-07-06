import PharmacyOrder from "../models/PharmacyOrder.js";
import { getNextId } from "../lib/counter.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
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

// Create order (digital auto-order OR manual counter/paper-Rx).
// Stock is never deducted here — only the Pharmacy bill (billingService) deducts stock,
// so a dispensed order and its auto-bill can't double-deduct the same sale.
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

  // If immediately dispensing (OTC counter sale), just mark dispense metadata —
  // stock is deducted when the auto-created Pharmacy bill is billed, not here.
  if (reqStatus === "Dispensed" && Array.isArray(items) && items.length > 0) {
    orderData.dispensedBy = userName;
    orderData.dispensedAt = new Date();
  }

  return PharmacyOrder.create(orderData);
}

// Update status / dispense — stock is deducted when the auto-created Pharmacy
// bill is billed (billingService), not here, so a dispense can't double-deduct.
export async function updateOrder(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const order = await PharmacyOrder.findOne({ _id: id, tenantId });
  if (!order) throw AppError.notFound("Order not found");

  const allowed = ["status", "dispensedBy", "dispensedAt", "notes", "items"];
  const update: any = {};
  allowed.forEach((k) => { if (body[k] !== undefined) update[k] = body[k]; });

  if (update.status === "Dispensed" && order.status !== "Dispensed") {
    update.dispensedBy = update.dispensedBy || userName;
    update.dispensedAt = update.dispensedAt || new Date();
  }

  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { new: true }
  );

  // Auto-bill on dispense
  let autoBill: { billId: string } | undefined;
  if (update.status === "Dispensed" && order.status !== "Dispensed" && updated) {
    try {
      const dispensedItems: any[] = update.items?.length ? update.items : order.items;
      const billItems = dispensedItems
        .filter((it: any) => it.drugId || it.drugName)
        .map((it: any) => ({
          description: it.drugName || "Drug",
          category:    "Pharmacy" as const,
          quantity:    it.quantity || 1,
          unitPrice:   it.mrpPerUnit ?? 0,
          total:       (it.quantity || 1) * (it.mrpPerUnit ?? 0),
        }));

      if (billItems.length > 0) {
        const bill = await createOrAppendBill({
          tenantId,
          patientId:   order.patientId,
          patientName: order.patientName,
          items:       billItems,
          type:        "Pharmacy",
          createdBy:   userName,
        });
        autoBill = { billId: (bill as any).billId };
      }
    } catch (billErr) {
      console.error("Auto-billing failed for pharmacy dispense:", billErr);
    }
  }

  return { ...(updated?.toObject() ?? {}), autoBill };
}
