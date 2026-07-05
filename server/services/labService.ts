import LabOrder from "../models/LabOrder.js";
import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
import { getNextId } from "../lib/counter.js";
import { AppError } from "../lib/AppError.js";

async function nextLabId(tenantId: string): Promise<string> {
  return getNextId(tenantId, "lab", "LAB-");
}

export interface LabListFilters {
  status?: string;
  priority?: string;
  patientId?: string;
  appointmentId?: string;
  page?: string;
  limit?: string;
}

export async function listOrders(tenantId: string, filters: LabListFilters) {
  const { status, priority, patientId, appointmentId, page = "1", limit = "50" } = filters;
  const query: any = { tenantId };
  if (status)        query.status        = status;
  if (priority)      query.priority      = priority;
  if (patientId)     query.patientId     = patientId;
  if (appointmentId) query.appointmentId = appointmentId;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [orders, total] = await Promise.all([
    LabOrder.find(query).sort({ ordered: -1 }).skip(skip).limit(parseInt(limit)),
    LabOrder.countDocuments(query),
  ]);
  return { orders, total };
}

export async function getOrder(tenantId: string, id: string) {
  const order = await LabOrder.findOne({ _id: id, tenantId });
  if (!order) throw AppError.notFound("Lab order not found");
  return order;
}

export async function createOrder(tenantId: string, doctorName: string, body: Record<string, any>) {
  const { patientId, patientName, test } = body;
  if (!patientId || !patientName || !test) {
    throw AppError.badRequest("patientId, patientName, test required");
  }
  const labId = await nextLabId(tenantId);
  return LabOrder.create({
    ...body,
    tenantId,
    labId,
    doctor: body.doctor || doctorName,
    parameters: body.parameters || [],
    sampleDate: body.sampleDate || null,
  });
}

export async function updateOrder(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const allowed = ["status", "result", "priority", "notes", "parameters", "sampleDate", "reportedBy"];
  const update: any = {};
  allowed.forEach((k) => { if (body[k] !== undefined) update[k] = body[k]; });

  // Auto-set status to Completed when result is entered
  if ((update.result || (update.parameters && update.parameters.length > 0)) && !update.status) {
    update.status = "Completed";
  }

  const before = await LabOrder.findOne({ _id: id, tenantId });
  if (!before) throw AppError.notFound("Lab order not found");

  const order = await LabOrder.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { new: true }
  );
  if (!order) throw AppError.notFound("Lab order not found");

  // Auto-bill on first transition to Completed
  let autoBill: { billId: string } | undefined;
  if (update.status === "Completed" && before.status !== "Completed") {
    try {
      const rateMaster = await ServiceRateMaster.findOne({
        tenantId,
        category: "Lab",
        name: { $regex: new RegExp(order.test.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        isActive: true,
      });
      const rate = rateMaster?.defaultRate ?? 0;

      const bill = await createOrAppendBill({
        tenantId,
        patientId:     order.patientId,
        patientName:   order.patientName,
        appointmentId: order.appointmentId || undefined,
        items: [{
          description: order.test,
          category:    "Lab",
          quantity:    1,
          unitPrice:   rate,
          total:       rate,
        }],
        type:      "Lab",
        createdBy: userName,
      });
      autoBill = { billId: (bill as any).billId };
    } catch (billErr) {
      console.error("Auto-billing failed for lab order:", billErr);
    }
  }

  return { ...order.toObject(), autoBill };
}
