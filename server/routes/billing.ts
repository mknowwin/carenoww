import { Router } from "express";
import BillingRecord from "../models/BillingRecord.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextBillId(tenantId: string): Promise<string> {
  const count = await BillingRecord.countDocuments({ tenantId });
  return `BILL-${String(count + 1).padStart(4, "0")}`;
}

function computeStatus(amount: number, paid: number): string {
  if (paid >= amount) return "Paid";
  if (paid > 0)       return "Partial";
  return "Pending";
}

// ── GET /api/billing ──────────────────────────────────────────────────────────
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { status, patientId, type, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status)    query.status    = status;
    if (patientId) query.patientId = patientId;
    if (type)      query.type      = type;

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
router.get("/:id", async (req: AuthRequest, res) => {
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
    const {
      patientId, patientName, appointmentId, admissionId,
      items = [], amount, paid = 0, discount = 0,
      payer, paymentMode, type, notes,
    } = req.body;

    if (!patientId || !patientName) {
      return res.status(400).json({ error: "patientId and patientName required" });
    }

    // Compute amount from items if items provided and amount not explicitly set
    let finalAmount = amount;
    if (!finalAmount && items.length) {
      finalAmount = items.reduce((s: number, it: any) => s + (it.total || it.unitPrice * (it.quantity || 1)), 0);
      finalAmount = Math.max(0, finalAmount - (discount || 0));
    }
    if (!finalAmount) return res.status(400).json({ error: "amount or items[] required" });

    const balance = finalAmount - paid;
    const billId  = await nextBillId(req.user!.tenantId);

    const bill = await BillingRecord.create({
      tenantId:      req.user!.tenantId,
      billId,
      patientId,     patientName,
      appointmentId: appointmentId || "",
      admissionId:   admissionId   || "",
      items,
      amount:        finalAmount,
      paid,
      balance,
      discount:      discount || 0,
      status:        computeStatus(finalAmount, paid),
      payer:         payer       || "Self",
      paymentMode:   paymentMode || "Cash",
      type:          type        || "OPD",
      notes:         notes       || "",
      createdBy:     req.user!.name,
    });
    res.status(201).json(bill);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Bill ID conflict — retry" });
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/billing/:id — update payment / add items ─────────────────────────
router.put("/:id", requireRole("admin", "receptionist", "nurse", "finance"), async (req: AuthRequest, res) => {
  try {
    const existing = await BillingRecord.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!existing) return res.status(404).json({ error: "Bill not found" });

    const { items, paid, discount, paymentMode, payer, status, notes } = req.body;
    const update: any = {};

    if (items   !== undefined) update.items       = items;
    if (paymentMode !== undefined) update.paymentMode = paymentMode;
    if (payer   !== undefined) update.payer        = payer;
    if (notes   !== undefined) update.notes        = notes;
    if (status  !== undefined) update.status       = status;

    const finalItems    = items   !== undefined ? items   : existing.items;
    const finalDiscount = discount !== undefined ? discount : existing.discount;
    const finalPaid     = paid    !== undefined ? paid    : existing.paid;
    const finalAmount   = finalItems.length
      ? Math.max(0, finalItems.reduce((s: number, it: any) => s + (it.total || it.unitPrice * (it.quantity || 1)), 0) - finalDiscount)
      : existing.amount;

    update.amount   = finalAmount;
    update.paid     = finalPaid;
    update.discount = finalDiscount;
    update.balance  = finalAmount - finalPaid;
    if (!status) update.status = computeStatus(finalAmount, finalPaid);

    const bill = await BillingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: update },
      { new: true }
    );
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
