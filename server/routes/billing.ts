import { Router } from "express";
import BillingRecord from "../models/BillingRecord.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextBillId(tenantId: string): Promise<string> {
  const count = await BillingRecord.countDocuments({ tenantId });
  return `BILL-${String(count + 1).padStart(3, "0")}`;
}

// GET /api/billing
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { status, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status) query.status = status;

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

// POST /api/billing
router.post("/", requireRole("admin", "receptionist", "finance"), async (req: AuthRequest, res) => {
  try {
    const billId = await nextBillId(req.user!.tenantId);
    const { amount, paid } = req.body;
    const balance = (amount || 0) - (paid || 0);
    let status = "Pending";
    if (paid >= amount) status = "Paid";
    else if (paid > 0) status = "Partial";

    const bill = await BillingRecord.create({
      ...req.body,
      tenantId: req.user!.tenantId,
      billId,
      balance,
      status,
    });
    res.status(201).json(bill);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/billing/:id
router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const bill = await BillingRecord.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/billing/:id
router.put("/:id", requireRole("admin", "receptionist", "finance"), async (req: AuthRequest, res) => {
  try {
    const updates = { ...req.body };
    if (updates.amount !== undefined || updates.paid !== undefined) {
      const existing = await BillingRecord.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
      if (!existing) return res.status(404).json({ error: "Bill not found" });
      const amount = updates.amount ?? existing.amount;
      const paid = updates.paid ?? existing.paid;
      updates.balance = amount - paid;
      if (paid >= amount) updates.status = "Paid";
      else if (paid > 0) updates.status = "Partial";
      else updates.status = "Pending";
    }
    const bill = await BillingRecord.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: updates },
      { new: true }
    );
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
