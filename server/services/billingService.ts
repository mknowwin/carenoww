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
  if (paid > 0) return "Partial";
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

// Verify stock availability up front — a Pharmacy bill must not be created or
// finalized if it can't actually be fulfilled from inventory. Deferred for
// Drafts until they're finalized, since draft items may still change.
export async function checkPharmacyStock(tenantId: string, pharmacyItems: any[], session?: mongoose.ClientSession) {
  const shortages: Array<{ drugId: string; name?: string; required: number; available: number }> = [];
  for (const item of pharmacyItems) {
    const qty = item.quantity ?? 1;
    const available = await getAvailableStock(tenantId.toString(), item.drugId, session);
    if (available < qty) {
      shortages.push({ drugId: item.drugId, name: item.name || item.drugName, required: qty, available });
    }
  }
  return shortages;
}

// Deducts stock for every item in allItems that's a pharmacy line item
// (category "Pharmacy" with a drugId); everything else passes through
// unchanged. Availability was already verified above, so a throw here should
// only happen on a genuine race (concurrent bill draining the same batch).
// Always called inside the caller's transaction: throwing here aborts the
// whole bill create/finalize, so a bill is never left committed with no
// matching deduction.
//
// For batch-tracked drugs, a single input line item can be fulfilled from
// multiple batches (FEFO); each batch has its own MRP, so the returned array
// replaces that one line with one line per batch actually drawn from, priced
// at that batch's own MRP. Non-batch-tracked drugs have only one flat price
// on DrugInventory, so there's nothing to split — they pass through as a
// single line, same as today.
export async function deductAndExpandPharmacyItems(tenantId: string, allItems: any[], session: mongoose.ClientSession): Promise<any[]> {
  const result: any[] = [];
  for (const item of allItems) {
    if (!(item.category === "Pharmacy" && item.drugId)) {
      result.push(item);
      continue;
    }

    const drug = await DrugInventory.findOne({ _id: item.drugId, tenantId }).session(session);
    if (!drug) {
      result.push(item);
      continue;
    }
    const qty = item.quantity ?? 1;

    if (drug.isBatchTracked) {
      // FEFO batch deduction — syncs DrugInventory.stock from batches, and
      // may span multiple batches; expand into one line item per batch drawn.
      const used = await fefoDeduct(tenantId.toString(), item.drugId, qty, session);
      await syncDrugStock(tenantId.toString(), item.drugId, session);
      for (const u of used) {
        result.push({
          ...item,
          quantity: u.deducted,
          unitPrice: u.mrpPerUnit,
          total: u.deducted * u.mrpPerUnit,
          batchNo: u.batchNo,
          expiryDate: u.expiryDate,
        });
      }
    } else {
      if (drug.stock < qty) {
        const err: any = new Error("Insufficient stock");
        err.insufficientStock = true;
        err.drugId = item.drugId;
        err.available = drug.stock;
        throw err;
      }
      // Direct stock decrement on the inventory record
      const newStock = drug.stock - qty;
      console.log(`Deducting ${qty} from ${item.drugId} stock ${drug.stock} → ${newStock}`);
      const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
      const ratio = newStock / reorderLevel;
      const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
      await DrugInventory.findByIdAndUpdate(item.drugId, { $set: { stock: newStock, status } }, { session });
      result.push(item);
    }
  }
  return result;
}

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
  if (status) query.status = status;
  if (patientId) query.patientId = patientId;
  if (type) query.type = type;
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
    payer, paymentMode, type, notes, status = "Pending",
  } = body;

  const isDraft = status === "Draft";

  if (!patientId || !patientName) {
    throw AppError.badRequest("patientId and patientName required");
  }

  // Duplicate check: one bill per appointment (not for Pharmacy/Lab standalone bills).
  // Runs for Drafts too — a draft still reserves the appointment's bill slot.
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
  if (!isDraft && !finalAmount) throw AppError.badRequest("amount or items[] required");

  // Verify stock availability up front — a Pharmacy bill must not be created
  // if it can't actually be fulfilled from inventory. Deferred to finalize time
  // for Drafts (see updateBill), since items may still change before then.
  const pharmacyItems = type === "Pharmacy"
    ? (items as any[]).filter((it) => it.category === "Pharmacy" && it.drugId)
    : [];
  if (!isDraft && pharmacyItems.length) {
    const shortages = await checkPharmacyStock(tenantId, pharmacyItems);
    if (shortages.length) {
      throw AppError.conflict("Insufficient stock for one or more items", { shortages });
    }
  }

  // Drafts never carry a payment — money is only recorded once a bill is finalized.
  const paidAmount = isDraft ? 0 : Number(paid);

  const buildDoc = (billId: string, payments: any[], itemsOverride?: any[], amountOverride?: number) => {
    const docItems = itemsOverride ?? items;
    const docAmount = amountOverride ?? finalAmount;
    const docBalance = docAmount - paidAmount;
    return {
      tenantId,
      billId,
      patientId, patientName,
      appointmentId: appointmentId || undefined,
      admissionId: admissionId || undefined,
      items: docItems,
      amount: docAmount,
      paid: paidAmount,
      balance: docBalance,
      discount,
      discountType,
      discountPercent,
      status: isDraft ? "Draft" : computeStatus(docAmount, paidAmount),
      payer: payer || "Self",
      paymentMode: paymentMode || "Cash",
      type: type || "OPD",
      notes: notes || "",
      createdBy: user.name,
      createdById: user.id,
      payments,
      isLocked: isDraft ? false : paidAmount >= docAmount,
    };
  };

  if (isDraft) {
    // Drafts get a placeholder, non-fiscal id from a separate counter so an
    // abandoned draft never leaves a gap in the real GST invoice sequence. The
    // real BILL-xxxx number is only drawn from the tenant's fiscal counter when
    // the draft is finalized (see updateBill).
    const billId = await getNextId(tenantId, "bill-draft", "DFT-");
    try {
      return await BillingRecord.create(buildDoc(billId, []));
    } catch (err: any) {
      if (err.code === 11000) throw AppError.conflict("Bill ID conflict — retry");
      throw err;
    }
  }

  // Non-draft: fiscal billId/paymentId allocation, bill creation, and pharmacy
  // stock deduction must all commit or all roll back together. Otherwise a
  // stock-deduction failure could leave a committed bill with no matching
  // deduction, or (since counters increment even on rollback outside a
  // transaction) burn a fiscal invoice number for a bill that never went out.
  const session = await mongoose.startSession();
  let bill: any;
  try {
    await session.withTransaction(async () => {
      const tenant = await Tenant.findById(tenantId).select("settings.invoicePrefix").session(session).lean();
      const invoicePrefix = ((tenant as any)?.settings?.invoicePrefix || "BILL").toString().trim();
      const billId = await getNextId(tenantId, "bill", `${invoicePrefix}-`, session);

      const payments: any[] = [];
      if (paidAmount > 0) {
        const paymentId = await getNextId(tenantId, `pay-${billId}`, "PAY-", session);
        payments.push({
          paymentId,
          amount: paidAmount,
          paymentMode: paymentMode || "Cash",
          payer: payer || "Self",
          receivedBy: user.name,
          receivedById: user.id,
          paidAt: new Date(),
        });
      }

      let itemsForDoc = items;
      let amountForDoc = finalAmount;
      if (pharmacyItems.length) {
        itemsForDoc = await deductAndExpandPharmacyItems(tenantId, items, session);
        // Only recompute the amount when it was originally derived from
        // items (not an explicit caller-supplied flat amount) — a batch
        // split can change the total when per-batch MRPs differ.
        if (!amount) {
          amountForDoc = calcAmount(itemsForDoc, discount, discountType, discountPercent);
        }
      }

      const [created] = await BillingRecord.create([buildDoc(billId, payments, itemsForDoc, amountForDoc)], { session });
      bill = created;
    });
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Bill ID conflict — retry");
    if (err.insufficientStock) {
      throw AppError.conflict("Insufficient stock for one or more items", {
        shortages: [{ drugId: err.drugId, available: err.available }],
      });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return bill;
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
  if (payer !== undefined) update.payer = payer;
  if (notes !== undefined) update.notes = notes;
  if (status !== undefined) update.status = status;
  if (discountType !== undefined) update.discountType = discountType;
  if (discountPercent !== undefined) update.discountPercent = discountPercent;

  const finalItems = items !== undefined ? items : existing.items;
  const finalDiscount = discount !== undefined ? discount : existing.discount;
  const finalDiscountType = discountType ?? existing.discountType;
  const finalDiscountPct = discountPercent ?? existing.discountPercent;
  const finalPaid = paid !== undefined ? paid : existing.paid;
  const finalAmount = finalItems.length
    ? calcAmount(finalItems, finalDiscount, finalDiscountType, finalDiscountPct)
    : existing.amount;

  update.items = finalItems;
  update.amount = finalAmount;
  update.paid = finalPaid;
  update.discount = finalDiscount;
  update.balance = finalAmount - finalPaid;
  update.isLocked = finalPaid >= finalAmount;
  if (!status) update.status = computeStatus(finalAmount, finalPaid);

  // Draft → finalize transition: any update to an open Draft that doesn't
  // explicitly resend status: "Draft" finalizes it. This mirrors GRN's
  // Draft → Received transition — the checks/side-effects deferred at draft
  // creation (full amount/items validation, pharmacy stock, real billId) all
  // happen right here instead of a dedicated sub-route.
  const wasDraft = existing.status === "Draft";
  const stayingDraft = status === "Draft";
  const becomingFinal = wasDraft && !stayingDraft;

  if (becomingFinal && !finalAmount) {
    throw AppError.badRequest("Cannot finalize an empty draft — amount or items[] required");
  }

  const pharmacyItems = existing.type === "Pharmacy"
    ? (finalItems as any[]).filter((it: any) => it.category === "Pharmacy" && it.drugId)
    : [];

  if (becomingFinal && pharmacyItems.length) {
    const shortages = await checkPharmacyStock(tenantId, pharmacyItems);
    if (shortages.length) {
      throw AppError.conflict("Insufficient stock for one or more items", { shortages });
    }
  }

  if (stayingDraft) {
    update.status = "Draft";
    update.isLocked = false;
  }

  if (!becomingFinal) {
    return BillingRecord.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });
  }

  // Finalizing a draft draws a real fiscal invoice number and, for Pharmacy
  // bills, deducts stock — both must commit or roll back together, so a
  // failed deduction never leaves the draft holding a burned invoice number.
  const session = await mongoose.startSession();
  let updated: any;
  try {
    await session.withTransaction(async () => {
      // Draw a real, sequential fiscal invoice number now — the draft only ever
      // held a non-fiscal DFT- placeholder, so finalizing never skips a number.
      const tenant = await Tenant.findById(tenantId).select("settings.invoicePrefix").session(session).lean();
      const invoicePrefix = ((tenant as any)?.settings?.invoicePrefix || "BILL").toString().trim();
      update.billId = await getNextId(tenantId, "bill", `${invoicePrefix}-`, session);

      if (pharmacyItems.length) {
        const itemsForDoc = await deductAndExpandPharmacyItems(tenantId, finalItems, session);
        update.items = itemsForDoc;
        update.amount = calcAmount(itemsForDoc, finalDiscount, finalDiscountType, finalDiscountPct);
        update.balance = update.amount - finalPaid;
        update.isLocked = finalPaid >= update.amount;
        if (!status) update.status = computeStatus(update.amount, finalPaid);
      }

      updated = await BillingRecord.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: update },
        { new: true, session }
      );
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

  return updated;
}

export async function postPayment(tenantId: string, user: { id: string; name: string }, id: string, body: Record<string, any>) {
  const bill = await BillingRecord.findOne({ _id: id, tenantId });
  if (!bill) throw AppError.notFound("Bill not found");

  const { amount, paymentMode = "Cash", payer, transactionRef, notes } = body;
  const payAmt = Number(amount);
  if (!payAmt || payAmt <= 0) throw AppError.badRequest("amount must be > 0");
  if (payAmt > bill.balance) throw AppError.badRequest("Payment exceeds outstanding balance");

  const paymentId = await getNextId(tenantId, `pay-${bill.billId}`, "PAY-");
  const entry = {
    paymentId,
    amount: payAmt,
    paymentMode,
    payer: payer || bill.payer,
    transactionRef: transactionRef || "",
    receivedBy: user.name,
    receivedById: user.id,
    notes: notes || "",
    paidAt: new Date(),
  };

  const newPaid = bill.paid + payAmt;
  const newBalance = bill.amount - newPaid;
  const newStatus = computeStatus(bill.amount, newPaid);

  return BillingRecord.findByIdAndUpdate(
    bill._id,
    {
      $push: { payments: entry },
      $set: {
        paid: newPaid,
        balance: newBalance,
        status: newStatus,
        paymentMode,
        payer: payer || bill.payer,
        isLocked: newPaid >= bill.amount,
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
        status: "Claimed",
        "insurance.tpaName": tpaName || "",
        "insurance.policyNo": policyNo || "",
        "insurance.memberNo": memberNo || "",
        "insurance.preAuthNo": preAuthNo || "",
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
        status: "Claimed",
        "insurance.claimNo": claimNo,
        "insurance.claimStatus": "Filed",
        "insurance.claimAmount": claimAmount ?? bill.balance,
        "insurance.submittedDate": new Date(),
      },
    },
    { new: true }
  );
}

export async function updateClaim(tenantId: string, user: { id: string; name: string }, id: string, body: Record<string, any>) {
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
    insUpdate["insurance.settledDate"] = new Date();
    insUpdate.status = computeStatus(bill.amount, bill.paid + settled);
    insUpdate.paid = bill.paid + settled;
    insUpdate.balance = Math.max(0, bill.balance - settled);
    insUpdate.isLocked = (bill.paid + settled) >= bill.amount;
    updates.$push = {
      payments: {
        paymentId,
        amount: settled,
        paymentMode: "Insurance",
        payer: bill.insurance?.tpaName || "Insurance",
        receivedBy: user.name,
        receivedById: user.id,
        paidAt: new Date(),
      },
    };
  }

  return BillingRecord.findByIdAndUpdate(bill._id, updates, { new: true });
}

export async function salesByStaff(
  tenantId: string,
  timezone: string,
  filters: { from?: string; to?: string },
  requester: { id: string; role: string }
) {
  const { from, to } = filters;

  const dateFilter: any = {};
  if (from) dateFilter.$gte = startOfDayUtc(from, timezone);
  if (to) dateFilter.$lte = endOfDayUtc(to, timezone);

  const matchStage: any = { tenantId: new mongoose.Types.ObjectId(tenantId), status: { $ne: "Draft" } };
  if (from || to) matchStage.createdAt = dateFilter;

  const isPrivileged = ["admin", "finance"].includes(requester.role);
  const creatorMatch = isPrivileged ? matchStage : { ...matchStage, createdById: requester.id };

  const PAYMENT_MODES = ["Cash", "Card", "UPI", "Insurance", "Online", "Advance-Adjustment"] as const;
  const emptyBreakdown = () => Object.fromEntries(PAYMENT_MODES.map(m => [m, 0]));

  const [byCreator, byReceiver, byReceiverMode] = await Promise.all([
    BillingRecord.aggregate([
      { $match: creatorMatch },
      {
        $group: {
          _id: "$createdBy",
          billsCreated: { $sum: 1 },
          totalBilled: { $sum: "$amount" },
          totalPaid: { $sum: "$paid" },
        },
      },
    ]),
    BillingRecord.aggregate([
      { $match: matchStage },
      { $unwind: "$payments" },
      ...(isPrivileged ? [] : [{ $match: { "payments.receivedById": requester.id } }]),
      {
        $group: {
          _id: "$payments.receivedBy",
          paymentsCount: { $sum: 1 },
          totalReceived: { $sum: "$payments.amount" },
        },
      },
    ]),
    BillingRecord.aggregate([
      { $match: matchStage },
      { $unwind: "$payments" },
      ...(isPrivileged ? [] : [{ $match: { "payments.receivedById": requester.id } }]),
      {
        $group: {
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
      staffName: row._id,
      billsCreated: row.billsCreated,
      totalBilled: row.totalBilled,
      totalPaid: row.totalPaid,
      paymentsCount: 0,
      totalReceived: 0,
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
        staffName: row._id,
        billsCreated: 0,
        totalBilled: 0,
        totalPaid: 0,
        paymentsCount: row.paymentsCount,
        totalReceived: row.totalReceived,
        paymentBreakdown: emptyBreakdown(),
      });
    }
  }

  for (const row of byReceiverMode) {
    const { receivedBy, paymentMode } = row._id;
    if (!receivedBy || !paymentMode) continue;
    if (!staffMap.has(receivedBy)) {
      staffMap.set(receivedBy, {
        staffName: receivedBy,
        billsCreated: 0,
        totalBilled: 0,
        totalPaid: 0,
        paymentsCount: 0,
        totalReceived: 0,
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
