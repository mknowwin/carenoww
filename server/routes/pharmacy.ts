import { Router } from "express";
import PharmacyOrder from "../models/PharmacyOrder.js";
import DrugInventory from "../models/DrugInventory.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextRxId(tenantId: string): Promise<string> {
  const count = await PharmacyOrder.countDocuments({ tenantId });
  return `RX-${String(count + 1).padStart(4, "0")}`;
}

// ── Pharmacy Orders ───────────────────────────────────────────────────────────

// GET /api/pharmacy/orders
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const { status, patientId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status)    query.status    = status;
    if (patientId) query.patientId = patientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      PharmacyOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      PharmacyOrder.countDocuments(query),
    ]);
    res.json({ orders, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/orders
router.post("/orders", requireRole("admin", "doctor", "pharmacist", "nurse", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const rxId = await nextRxId(req.user!.tenantId);
    const order = await PharmacyOrder.create({ ...req.body, tenantId: req.user!.tenantId, rxId });
    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/pharmacy/orders/:id — update status / dispense
router.put("/orders/:id", requireRole("admin", "pharmacist", "nurse"), async (req: AuthRequest, res) => {
  try {
    const allowed = ["status", "dispensedBy", "dispensedAt", "notes"];
    const update: any = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // Auto-set dispense metadata when dispensing
    if (update.status === "Dispensed" && !update.dispensedBy) {
      update.dispensedBy = req.user!.name;
      update.dispensedAt = new Date();
    }

    const order = await PharmacyOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: update },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Drug Inventory ────────────────────────────────────────────────────────────

// GET /api/pharmacy/inventory
router.get("/inventory", async (req: AuthRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (search) query.name = { $regex: search, $options: "i" };
    const inventory = await DrugInventory.find(query).sort({ name: 1 });
    res.json(inventory);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/inventory
router.post("/inventory", requireRole("admin", "pharmacist"), async (req: AuthRequest, res) => {
  try {
    const drug = await DrugInventory.create({ ...req.body, tenantId: req.user!.tenantId });
    res.status(201).json(drug);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Drug already exists in inventory" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/pharmacy/inventory/:id
router.put("/inventory/:id", requireRole("admin", "pharmacist"), async (req: AuthRequest, res) => {
  try {
    const updates = { ...req.body };
    const current = await DrugInventory.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!current) return res.status(404).json({ error: "Drug not found" });

    const stock        = updates.stock        ?? current.stock;
    const reorderLevel = updates.reorderLevel ?? current.reorderLevel;
    const ratio = reorderLevel > 0 ? stock / reorderLevel : 2;
    updates.status = ratio <= 0 ? "Critical" : ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";

    const drug = await DrugInventory.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: updates },
      { new: true }
    );
    res.json(drug);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
