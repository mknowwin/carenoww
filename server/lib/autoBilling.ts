import mongoose from "mongoose";
import BillingRecord, { IBillItem } from "../models/BillingRecord.js";
import Tenant from "../models/Tenant.js";
import { getNextId } from "./counter.js";

type BillType = "OPD" | "IPD" | "Emergency" | "Lab" | "Pharmacy";

interface AutoBillParams {
  tenantId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  admissionId?: string;
  items: Array<Omit<IBillItem, "_id">>;
  type: BillType;
  payer?: string;
  paymentMode?: string;
  createdBy: string;
}

function computeStatus(amount: number, paid: number): "Paid" | "Partial" | "Pending" {
  if (paid >= amount) return "Paid";
  if (paid > 0) return "Partial";
  return "Pending";
}

/**
 * Find an existing pending/partial bill for this appointment or admission and
 * append items to it. If none exists, create a new bill.
 */
export async function createOrAppendBill(params: AutoBillParams, session?: mongoose.ClientSession): Promise<typeof BillingRecord.prototype> {
  const {
    tenantId, patientId, patientName,
    appointmentId, admissionId, items, type,
    payer = "Self", paymentMode = "Cash", createdBy,
  } = params;

  const subtotal = items.reduce((s, it) => s + it.total, 0);

  // Try to find an unlocked, non-paid bill for this encounter
  let lookupQuery: any = { tenantId, status: { $ne: "Paid" }, isLocked: false };
  if (appointmentId) lookupQuery.appointmentId = appointmentId;
  else if (admissionId) lookupQuery.admissionId = admissionId;
  else lookupQuery = null; // no encounter link — always create new

  if (lookupQuery) {
    const existing = await BillingRecord.findOne(lookupQuery).session(session ?? null);
    if (existing) {
      const newAmount = existing.amount + subtotal;
      const newBalance = newAmount - existing.paid;
      const updated = await BillingRecord.findByIdAndUpdate(
        existing._id,
        {
          $push: { items: { $each: items } },
          $set: {
            amount: newAmount,
            balance: newBalance,
            status: computeStatus(newAmount, existing.paid),
          },
        },
        { new: true, session }
      );
      return updated!;
    }
  }

  // Create a new bill
  const tenant = await Tenant.findById(tenantId).select("settings.invoicePrefix").session(session ?? null).lean();
  const invoicePrefix = ((tenant as any)?.settings?.invoicePrefix || "BILL").toString().trim();
  const billId = await getNextId(tenantId, "bill", `${invoicePrefix}-`, session);
  const [bill] = await BillingRecord.create([{
    tenantId,
    billId,
    patientId,
    patientName,
    appointmentId: appointmentId || undefined,
    admissionId:   admissionId   || undefined,
    items,
    amount:      subtotal,
    paid:        0,
    balance:     subtotal,
    discount:    0,
    status:      "Pending",
    type,
    payer,
    paymentMode,
    createdBy,
  }], { session });
  return bill;
}
