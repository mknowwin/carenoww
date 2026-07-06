import Prescription from "../models/Prescription.js";
import PharmacyOrder from "../models/PharmacyOrder.js";
import { getNextId } from "../lib/counter.js";
import { AppError } from "../lib/AppError.js";

export interface PrescriptionListFilters {
  patientId?: string;
  appointmentId?: string;
  admissionId?: string;
  status?: string;
}

export async function listPrescriptions(tenantId: string, filters: PrescriptionListFilters) {
  const { patientId, appointmentId, admissionId, status } = filters;
  const query: any = { tenantId };
  if (patientId)     query.patientId     = patientId;
  if (appointmentId) query.appointmentId = appointmentId;
  if (admissionId)   query.admissionId   = admissionId;
  if (status)        query.status        = status;

  return Prescription.find(query).sort({ createdAt: -1 });
}

// Create prescription + auto-create pharmacy order
export async function createPrescription(tenantId: string, user: { name: string; id: string }, body: Record<string, any>) {
  const { patientId, patientName, appointmentId, admissionId, type, items, notes } = body;

  if (!patientId || !patientName || !items?.length) {
    throw AppError.badRequest("patientId, patientName, and items[] required");
  }

  const rxId = await getNextId(tenantId, "prx", "PRX-");

  const prescription = await Prescription.create({
    tenantId,
    rxId,
    patientId,
    patientName,
    appointmentId:  appointmentId  || "",
    admissionId:    admissionId    || "",
    prescribedBy:   user.name,
    prescribedById: user.id || "",
    type:           type || "OPD",
    items,
    notes: notes || "",
  });

  // Auto-create one structured PharmacyOrder with individual drug items
  try {
    const pharmRxId = await getNextId(tenantId, "rx", "RX-");

    // Build structured items[] (no inventory drugId yet — pharmacist links at dispense)
    const orderItems = items.map((it: any) => ({
      drugName:    it.drug,
      batchNo:     "",
      quantity:    it.quantity || 1,
      unit:        it.unit || "units",
      mrpPerUnit:  0,
      totalAmount: 0,
    }));

    // Legacy drug summary for backward compat display
    const drugSummary = items.map((it: any) =>
      `${it.drug} ${it.dose} ${it.frequency}${it.duration ? " × " + it.duration : ""}`
    ).join("; ");

    await PharmacyOrder.create({
      tenantId,
      rxId:          pharmRxId,
      patientId,
      patientName,
      drug:          drugSummary,
      qty:           items.reduce((s: number, it: any) => s + (it.quantity || 1), 0),
      unit:          "units",
      items:         orderItems,
      type:          type || "OPD",
      rxSource:      "Digital",
      doctor:        user.name,
      time:          new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      prescriptionId: prescription._id.toString(),
    });
  } catch {
    // pharmacy order creation is best-effort; don't fail the prescription
  }

  return prescription;
}

export async function updatePrescription(tenantId: string, id: string, body: Record<string, any>) {
  const { status, notes } = body;
  const update: any = {};
  if (status !== undefined)  update.status = status;
  if (notes  !== undefined)  update.notes  = notes;

  const rx = await Prescription.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { new: true }
  );
  if (!rx) throw AppError.notFound("Prescription not found");
  return rx;
}
