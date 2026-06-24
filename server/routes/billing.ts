import { Router } from "express";
import BillingRecord from "../models/BillingRecord.js";
import DrugInventory from "../models/DrugInventory.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { getNextId } from "../lib/counter.js";
import { fefoDeduct, syncDrugStock } from "../lib/fefo.js";

const router = Router();
router.use(authMiddleware);

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── GET /api/billing ──────────────────────────────────────────────────────────
router.get("/", requireRole("admin", "finance", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const { status, patientId, type, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status)    query.status    = status;
    if (patientId) query.patientId = patientId;
    if (type)      query.type      = type;
    // Non-admin/finance users see only their own bills
    if (!["admin", "finance"].includes(req.user!.role)) {
      query.createdById = req.user!.id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [bills, total] = await Promise.all([
      BillingRecord.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      BillingRecord.countDocuments(query),
    ]);
    res.json({ bills, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/billing/:id ──────────────────────────────────────────────────────
router.get("/:id", requireRole("admin", "finance", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const bill = await BillingRecord.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/billing ─────────────────────────────────────────────────────────
router.post("/", requireRole("admin", "receptionist", "nurse", "finance"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      patientId, patientName, appointmentId, admissionId,
      items = [], amount, paid = 0,
      discount = 0, discountType = "Flat", discountPercent = 0,
      payer, paymentMode, type, notes,
    } = req.body;

    if (!patientId || !patientName) {
      return res.status(400).json({ error: "patientId and patientName required" });
    }

    // Duplicate check: one bill per appointment (not for Pharmacy/Lab standalone bills)
    if (appointmentId && type !== "Pharmacy" && type !== "Lab") {
      const dupe = await BillingRecord.findOne({ tenantId, appointmentId, status: { $ne: "Claimed" } });
      if (dupe) {
        return res.status(409).json({ error: "Bill already exists for this appointment", existingBillId: dupe.billId });
      }
    }

    let finalAmount = amount;
    if (!finalAmount && items.length) {
      finalAmount = calcAmount(items, discount, discountType, discountPercent);
    }
    if (!finalAmount) return res.status(400).json({ error: "amount or items[] required" });

    const paidAmount = Number(paid);
    const balance    = finalAmount - paidAmount;
    const billId     = await getNextId(tenantId, "bill", "BILL-");

    // Record initial payment entry if paid > 0
    const payments: any[] = [];
    if (paidAmount > 0) {
      const paymentId = await getNextId(tenantId, `pay-${billId}`, "PAY-");
      payments.push({
        paymentId,
        amount:      paidAmount,
        paymentMode: paymentMode || "Cash",
        payer:       payer       || "Self",
        receivedBy:  req.user!.name,
        paidAt:      new Date(),
      });
    }

    const bill = await BillingRecord.create({
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
      createdBy:     req.user!.name,
      createdById:   req.user!.id,
      payments,
      isLocked:      paidAmount >= finalAmount,
    });

    // Deduct pharmacy stock for items that carry a drugId
    if (type === "Pharmacy") {
      const pharmacyItems = (items as any[]).filter((it) => it.category === "Pharmacy" && it.drugId);
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
        } catch {
          // best-effort: bill is saved even if stock deduction fails
        }
      }
    }

    res.status(201).json(bill);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Bill ID conflict — retry" });
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/billing/:id — update items / discount / notes ───────────────────
router.put("/:id", requireRole("admin", "receptionist", "nurse", "finance"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const existing = await BillingRecord.findOne({ _id: req.params.id, tenantId });
    if (!existing) return res.status(404).json({ error: "Bill not found" });

    // Protect locked bills from financial changes
    if (existing.isLocked) {
      const hasFinancialChange = Object.keys(req.body).some((k) => FINANCIAL_FIELDS.has(k));
      if (hasFinancialChange) {
        return res.status(409).json({ error: "Bill is locked after full payment. Use /unlock to modify or record a credit note." });
      }
    }

    const { items, paid, discount, discountType, discountPercent, paymentMode, payer, status, notes } = req.body;
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

    const bill = await BillingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true }
    );
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/billing/:id/payments — record a payment installment ─────────────
router.post("/:id/payments", requireRole("admin", "receptionist", "finance", "nurse"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const bill = await BillingRecord.findOne({ _id: req.params.id, tenantId });
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    const { amount, paymentMode = "Cash", payer, transactionRef, notes } = req.body;
    const payAmt = Number(amount);
    if (!payAmt || payAmt <= 0) return res.status(400).json({ error: "amount must be > 0" });
    if (payAmt > bill.balance) return res.status(400).json({ error: "Payment exceeds outstanding balance" });

    const paymentId = await getNextId(tenantId, `pay-${bill.billId}`, "PAY-");
    const entry = {
      paymentId,
      amount:       payAmt,
      paymentMode,
      payer:        payer       || bill.payer,
      transactionRef: transactionRef || "",
      receivedBy:   req.user!.name,
      notes:        notes || "",
      paidAt:       new Date(),
    };

    const newPaid    = bill.paid + payAmt;
    const newBalance = bill.amount - newPaid;
    const newStatus  = computeStatus(bill.amount, newPaid);

    const updated = await BillingRecord.findByIdAndUpdate(
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
    res.status(201).json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/billing/:id/unlock — admin unlocks a paid/locked bill ───────────
router.post("/:id/unlock", requireRole("admin", "finance"), async (req: AuthRequest, res) => {
  try {
    const bill = await BillingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: { isLocked: false }, $push: { notes: `\n[Unlocked by ${req.user!.name} on ${new Date().toLocaleDateString("en-IN")}]` } },
      { new: true }
    );
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/billing/:id/pre-auth — submit insurance pre-authorisation ───────
router.post("/:id/pre-auth", requireRole("admin", "finance", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const { tpaName, policyNo, memberNo, preAuthNo } = req.body;
    const bill = await BillingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
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
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/billing/:id/pre-auth — update pre-auth outcome ──────────────────
router.put("/:id/pre-auth", requireRole("admin", "finance"), async (req: AuthRequest, res) => {
  try {
    const { preAuthStatus, preAuthAmount } = req.body;
    const bill = await BillingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      {
        $set: {
          "insurance.preAuthStatus": preAuthStatus,
          "insurance.preAuthAmount": preAuthAmount ?? 0,
        },
      },
      { new: true }
    );
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/billing/:id/claim — file insurance claim ───────────────────────
router.post("/:id/claim", requireRole("admin", "finance"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { claimAmount } = req.body;
    const bill = await BillingRecord.findOne({ _id: req.params.id, tenantId });
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    const claimNo = await getNextId(tenantId, "claim", "CLM-");
    const updated = await BillingRecord.findByIdAndUpdate(
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
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/billing/:id/claim — update claim status (through to Settled) ─────
router.put("/:id/claim", requireRole("admin", "finance"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { claimStatus, settledAmount, rejectionReason } = req.body;
    const bill = await BillingRecord.findOne({ _id: req.params.id, tenantId });
    if (!bill) return res.status(404).json({ error: "Bill not found" });

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
          receivedBy:  req.user!.name,
          paidAt:      new Date(),
        },
      };
    }

    const updated = await BillingRecord.findByIdAndUpdate(bill._id, updates, { new: true });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/billing/report/by-staff — sales aggregated by staff member ─────────
router.get("/report/by-staff", requireRole("admin", "finance"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { from, to } = req.query as Record<string, string>;

    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = toDate;
    }

    const matchStage: any = { tenantId };
    if (from || to) matchStage.createdAt = dateFilter;

    const [byCreator, byReceiver] = await Promise.all([
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
    ]);

    const staffMap = new Map<string, any>();

    for (const row of byCreator) {
      if (!row._id) continue;
      staffMap.set(row._id, {
        staffName:     row._id,
        billsCreated:  row.billsCreated,
        totalBilled:   row.totalBilled,
        totalPaid:     row.totalPaid,
        paymentsCount: 0,
        totalReceived: 0,
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
          staffName:     row._id,
          billsCreated:  0,
          totalBilled:   0,
          totalPaid:     0,
          paymentsCount: row.paymentsCount,
          totalReceived: row.totalReceived,
        });
      }
    }

    res.json(Array.from(staffMap.values()).sort((a, b) => b.totalBilled - a.totalBilled));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
