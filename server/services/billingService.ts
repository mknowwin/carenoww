import mongoose from "mongoose";
import BillingRecord from "../models/BillingRecord.js";
import DrugInventory from "../models/DrugInventory.js";
import Tenant from "../models/Tenant.js";
import { startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";
import { getNextId } from "../lib/counter.js";
import { fefoDeduct, syncDrugStock, getAvailableStock } from "../lib/fefo.js";
import { AppError } from "../lib/AppError.js";

function computeStatus(amount: number, paid: number): "Paid" | "Partial" | "Pending" {
  if (paid >= amount) return "Paid";
  if (paid > 0)       return "Partial";
  return "Pending";
}

function calcAmount(items: any[], discount: number, discountType: string, discountPercent: number): number {
  const subtotal = items.reduce((s, it) => s + (it.total ?? it.unitPrice * (it.quantity ?? 1)), 0);
  const discountAmt = discountType === "Percent"
    ? Math.round((subtotal * discountPercent) / 100)
    : discount;
  return Math.max(0, subtotal - discountAmt);
}

const FINANCIAL_FIELDS = new Set(["items", "amount", "discount", "discountType", "discountPercent"]);

export interface BillListFilters {
  status?: string;
  patientId?: string;
  type?: string;
  page?: string;
  limit?: string;
}

export async function listBills(tenantId: string, user: { id: string; role: string }, filters: BillListFilters) {
  const { status, patientId, type, page = "1", limit = "50" } = filters;
  const query: any = { tenantId };
  if (status)    query.status    = status;
  if (patientId) query.patientId = patientId;
  if (type)      query.type      = type;
  // Non-admin/finance users see only their own bills
  if (!["admin", "finance"].includes(user.role)) {
    query.createdById = user.id;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [bills, total] = await Promise.all([
    BillingRecord.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    BillingRecord.countDocuments(query),
  ]);
  return { bills, total };
}

export async function getBill(tenantId: string, id: string) {
  const bill = await BillingRecord.findOne({ _id: id, tenantId });
  if (!bill) throw AppError.notFound("Bill not found");
  return bill;
}

export async function createBill(tenantId: string, user: { name: string; id: string }, body: Record<string, any>) {
  const {
    patientId, patientName, appointmentId, admissionId,
    items = [], amount, paid = 0,
    discount = 0, discountType = "Flat", discountPercent = 0,
    payer, paymentMode, type, notes,
  } = body;

  if (!patientId || !patientName) {
    throw AppError.badRequest("patientId and patientName required");
  }

  // Duplicate check: one bill per appointment (not for Pharmacy/Lab standalone bills)
  if (appointmentId && type !== "Pharmacy" && type !== "Lab") {
    const dupe = await BillingRecord.findOne({ tenantId, appointmentId, status: { $ne: "Claimed" } });
    if (dupe) {
      throw AppError.conflict("Bill already exists for this appointment", { existingBillId: dupe.billId });
    }
  }

  let finalAmount = amount;
  if (!finalAmount && items.length) {
    finalAmount = calcAmount(items, discount, discountType, discountPercent);
  }
  if (!finalAmount) throw AppError.badRequest("amount or items[] required");

  // Verify stock availability up front — a Pharmacy bill must not be created
  // if it can't actually be fulfilled from inventory.
  const pharmacyItems = type === "Pharmacy"
    ? (items as any[]).filter((it) => it.category === "Pharmacy" && it.drugId)
    : [];
  if (pharmacyItems.length) {
    const shortages: Array<{ drugId: string; name?: string; required: number; available: number }> = [];
    for (const item of pharmacyItems) {
      const qty = item.quantity ?? 1;
      const available = await getAvailableStock(tenantId.toString(), item.drugId);
      if (available < qty) {
        shortages.push({ drugId: item.drugId, name: item.name || item.drugName, required: qty, available });
      }
    }
    if (shortages.length) {
      throw AppError.conflict("Insufficient stock for one or more items", { shortages });
    }
  }

  const paidAmount = Number(paid);
  const balance    = finalAmount - paidAmount;
  const tenant     = await Tenant.findById(tenantId).select("settings.invoicePrefix").lean();
  const invoicePrefix = ((tenant as any)?.settings?.invoicePrefix || "BILL").toString().trim();
  const billId     = await getNextId(tenantId, "bill", `${invoicePrefix}-`);

  // Record initial payment entry if paid > 0
  const payments: any[] = [];
  if (paidAmount > 0) {
    const paymentId = await getNextId(tenantId, `pay-${billId}`, "PAY-");
    payments.push({
      paymentId,
      amount:      paidAmount,
      paymentMode: paymentMode || "Cash",
      payer:       payer       || "Self",
      receivedBy:  user.name,
      paidAt:      new Date(),
    });
  }

  let bill;
  try {
    bill = await BillingRecord.create({
      tenantId,
      billId,
      patientId,     patientName,
      appointmentId: appointmentId || undefined,
      admissionId:   admissionId   || undefined,
      items,
      amount:         finalAmount,
      paid:           paidAmount,
      balance,
      discount,
      discountType,
      discountPercent,
      status:        computeStatus(finalAmount, paidAmount),
      payer:         payer       || "Self",
      paymentMode:   paymentMode || "Cash",
      type:          type        || "OPD",
      notes:         notes       || "",
      createdBy:     user.name,
      createdById:   user.id,
      payments,
      isLocked:      paidAmount >= finalAmount,
    });
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Bill ID conflict — retry");
    throw err;
  }

  // Deduct pharmacy stock for items that carry a drugId. Availability was
  // already verified above, so this should only fail on a genuine race
  // (concurrent bill draining the same batch) — that must not be swallowed
  // silently, since it means a paid bill went out with no matching deduction.
  const stockDeductionErrors: Array<{ drugId: string; error: string }> = [];
  for (const item of pharmacyItems) {
    try {
      const drug = await DrugInventory.findOne({ _id: item.drugId, tenantId });
      if (!drug) continue;
      const qty = item.quantity ?? 1;

      if (drug.isBatchTracked) {
        // FEFO batch deduction — syncs DrugInventory.stock from batches
        await fefoDeduct(tenantId.toString(), item.drugId, qty);
        await syncDrugStock(tenantId.toString(), item.drugId);
      } else {
        // Direct stock decrement on the inventory record
        const newStock = Math.max(0, drug.stock - qty);
        const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
        const ratio = newStock / reorderLevel;
        const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
        await DrugInventory.findByIdAndUpdate(item.drugId, { $set: { stock: newStock, status } });
      }
    } catch (err: any) {
      console.error(`[billing] Stock deduction failed for drug ${item.drugId} on bill ${billId}:`, err);
      stockDeductionErrors.push({ drugId: item.drugId, error: err.message || "Deduction failed" });
    }
  }

  return stockDeductionErrors.length ? { ...bill.toObject(), stockDeductionErrors } : bill;
}

export async function updateBill(tenantId: string, id: string, body: Record<string, any>) {
  const existing = await BillingRecord.findOne({ _id: id, tenantId });
  if (!existing) throw AppError.notFound("Bill not found");

  // Protect locked bills from financial changes
  if (existing.isLocked) {
    const hasFinancialChange = Object.keys(body).some((k) => FINANCIAL_FIELDS.has(k));
    if (hasFinancialChange) {
      throw AppError.conflict("Bill is locked after full payment. Use /unlock to modify or record a credit note.");
    }
  }

  const { items, paid, discount, discountType, discountPercent, paymentMode, payer, status, notes } = body;
  const update: any = {};

  if (paymentMode !== undefined) update.paymentMode = paymentMode;
  if (payer   !== undefined)     update.payer   = payer;
  if (notes   !== undefined)     update.notes   = notes;
  if (status  !== undefined)     update.status  = status;
  if (discountType    !== undefined) update.discountType    = discountType;
  if (discountPercent !== undefined) update.discountPercent = discountPercent;

  const finalItems         = items    !== undefined ? items    : existing.items;
  const finalDiscount      = discount !== undefined ? discount : existing.discount;
  const finalDiscountType  = discountType  ?? existing.discountType;
  const finalDiscountPct   = discountPercent ?? existing.discountPercent;
  const finalPaid          = paid     !== undefined ? paid     : existing.paid;
  const finalAmount = finalItems.length
    ? calcAmount(finalItems, finalDiscount, finalDiscountType, finalDiscountPct)
    : existing.amount;

  update.items    = finalItems;
  update.amount   = finalAmount;
  update.paid     = finalPaid;
  update.discount = finalDiscount;
  update.balance  = finalAmount - finalPaid;
  update.isLocked = finalPaid >= finalAmount;
  if (!status) update.status = computeStatus(finalAmount, finalPaid);

  return BillingRecord.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { new: true }
  );
}

export async function postPayment(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const bill = await BillingRecord.findOne({ _id: id, tenantId });
  if (!bill) throw AppError.notFound("Bill not found");

  const { amount, paymentMode = "Cash", payer, transactionRef, notes } = body;
  const payAmt = Number(amount);
  if (!payAmt || payAmt <= 0) throw AppError.badRequest("amount must be > 0");
  if (payAmt > bill.balance) throw AppError.badRequest("Payment exceeds outstanding balance");

  const paymentId = await getNextId(tenantId, `pay-${bill.billId}`, "PAY-");
  const entry = {
    paymentId,
    amount:       payAmt,
    paymentMode,
    payer:        payer       || bill.payer,
    transactionRef: transactionRef || "",
    receivedBy:   userName,
    notes:        notes || "",
    paidAt:       new Date(),
  };

  const newPaid    = bill.paid + payAmt;
  const newBalance = bill.amount - newPaid;
  const newStatus  = computeStatus(bill.amount, newPaid);

  return BillingRecord.findByIdAndUpdate(
    bill._id,
    {
      $push:  { payments: entry },
      $set: {
        paid:       newPaid,
        balance:    newBalance,
        status:     newStatus,
        paymentMode,
        payer:      payer || bill.payer,
        isLocked:   newPaid >= bill.amount,
      },
    },
    { new: true }
  );
}

export async function unlockBill(tenantId: string, userName: string, id: string) {
  const bill = await BillingRecord.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { isLocked: false }, $push: { notes: `\n[Unlocked by ${userName} on ${new Date().toLocaleDateString("en-IN")}]` } },
    { new: true }
  );
  if (!bill) throw AppError.notFound("Bill not found");
  return bill;
}

export async function submitPreAuth(tenantId: string, id: string, body: Record<string, any>) {
  const { tpaName, policyNo, memberNo, preAuthNo } = body;
  const bill = await BillingRecord.findOneAndUpdate(
    { _id: id, tenantId },
    {
      $set: {
        status:                    "Claimed",
        "insurance.tpaName":       tpaName    || "",
        "insurance.policyNo":      policyNo   || "",
        "insurance.memberNo":      memberNo   || "",
        "insurance.preAuthNo":     preAuthNo  || "",
        "insurance.preAuthStatus": "Pending",
      },
    },
    { new: true }
  );
  if (!bill) throw AppError.notFound("Bill not found");
  return bill;
}

export async function updatePreAuth(tenantId: string, id: string, body: Record<string, any>) {
  const { preAuthStatus, preAuthAmount } = body;
  const bill = await BillingRecord.findOneAndUpdate(
    { _id: id, tenantId },
    {
      $set: {
        "insurance.preAuthStatus": preAuthStatus,
        "insurance.preAuthAmount": preAuthAmount ?? 0,
      },
    },
    { new: true }
  );
  if (!bill) throw AppError.notFound("Bill not found");
  return bill;
}

export async function fileClaim(tenantId: string, id: string, body: Record<string, any>) {
  const { claimAmount } = body;
  const bill = await BillingRecord.findOne({ _id: id, tenantId });
  if (!bill) throw AppError.notFound("Bill not found");

  const claimNo = await getNextId(tenantId, "claim", "CLM-");
  return BillingRecord.findByIdAndUpdate(
    bill._id,
    {
      $set: {
        status:                    "Claimed",
        "insurance.claimNo":       claimNo,
        "insurance.claimStatus":   "Filed",
        "insurance.claimAmount":   claimAmount ?? bill.balance,
        "insurance.submittedDate": new Date(),
      },
    },
    { new: true }
  );
}

export async function updateClaim(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const { claimStatus, settledAmount, rejectionReason } = body;
  const bill = await BillingRecord.findOne({ _id: id, tenantId });
  if (!bill) throw AppError.notFound("Bill not found");

  const insUpdate: any = { "insurance.claimStatus": claimStatus };
  if (rejectionReason) insUpdate["insurance.rejectionReason"] = rejectionReason;

  const updates: any = { $set: insUpdate };

  // When settled: record the settlement as a payment entry
  if (claimStatus === "Settled" && settledAmount) {
    const settled = Number(settledAmount);
    const paymentId = await getNextId(tenantId, `pay-${bill.billId}`, "PAY-");
    insUpdate["insurance.settledAmount"] = settled;
    insUpdate["insurance.settledDate"]   = new Date();
    insUpdate.status = computeStatus(bill.amount, bill.paid + settled);
    insUpdate.paid   = bill.paid + settled;
    insUpdate.balance = Math.max(0, bill.balance - settled);
    insUpdate.isLocked = (bill.paid + settled) >= bill.amount;
    updates.$push = {
      payments: {
        paymentId,
        amount:      settled,
        paymentMode: "Insurance",
        payer:       bill.insurance?.tpaName || "Insurance",
        receivedBy:  userName,
        paidAt:      new Date(),
      },
    };
  }

  return BillingRecord.findByIdAndUpdate(bill._id, updates, { new: true });
}

export async function salesByStaff(tenantId: string, timezone: string, filters: { from?: string; to?: string }) {
  const { from, to } = filters;

  const dateFilter: any = {};
  if (from) dateFilter.$gte = startOfDayUtc(from, timezone);
  if (to)   dateFilter.$lte = endOfDayUtc(to, timezone);

  const matchStage: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
  if (from || to) matchStage.createdAt = dateFilter;

  const PAYMENT_MODES = ["Cash", "Card", "UPI", "Insurance", "Online", "Advance-Adjustment"] as const;
  const emptyBreakdown = () => Object.fromEntries(PAYMENT_MODES.map(m => [m, 0]));

  const [byCreator, byReceiver, byReceiverMode] = await Promise.all([
    BillingRecord.aggregate([
      { $match: matchStage },
      { $group: {
          _id: "$createdBy",
          billsCreated: { $sum: 1 },
          totalBilled:  { $sum: "$amount" },
          totalPaid:    { $sum: "$paid" },
        },
      },
    ]),
    BillingRecord.aggregate([
      { $match: matchStage },
      { $unwind: "$payments" },
      { $group: {
          _id: "$payments.receivedBy",
          paymentsCount: { $sum: 1 },
          totalReceived: { $sum: "$payments.amount" },
        },
      },
    ]),
    BillingRecord.aggregate([
      { $match: matchStage },
      { $unwind: "$payments" },
      { $group: {
          _id: { receivedBy: "$payments.receivedBy", paymentMode: "$payments.paymentMode" },
          amount: { $sum: "$payments.amount" },
        },
      },
    ]),
  ]);

  const staffMap = new Map<string, any>();

  for (const row of byCreator) {
    if (!row._id) continue;
    staffMap.set(row._id, {
      staffName:        row._id,
      billsCreated:     row.billsCreated,
      totalBilled:      row.totalBilled,
      totalPaid:        row.totalPaid,
      paymentsCount:    0,
      totalReceived:    0,
      paymentBreakdown: emptyBreakdown(),
    });
  }

  for (const row of byReceiver) {
    if (!row._id) continue;
    if (staffMap.has(row._id)) {
      const entry = staffMap.get(row._id);
      entry.paymentsCount = row.paymentsCount;
      entry.totalReceived = row.totalReceived;
    } else {
      staffMap.set(row._id, {
        staffName:        row._id,
        billsCreated:     0,
        totalBilled:      0,
        totalPaid:        0,
        paymentsCount:    row.paymentsCount,
        totalReceived:    row.totalReceived,
        paymentBreakdown: emptyBreakdown(),
      });
    }
  }

  for (const row of byReceiverMode) {
    const { receivedBy, paymentMode } = row._id;
    if (!receivedBy || !paymentMode) continue;
    if (!staffMap.has(receivedBy)) {
      staffMap.set(receivedBy, {
        staffName:        receivedBy,
        billsCreated:     0,
        totalBilled:      0,
        totalPaid:        0,
        paymentsCount:    0,
        totalReceived:    0,
        paymentBreakdown: emptyBreakdown(),
      });
    }
    const entry = staffMap.get(receivedBy);
    if (paymentMode in entry.paymentBreakdown) {
      entry.paymentBreakdown[paymentMode] += row.amount;
    }
  }

  return Array.from(staffMap.values()).sort((a, b) => b.totalBilled - a.totalBilled);
}
