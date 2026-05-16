import { Router } from "express";
import LabOrder from "../models/LabOrder.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextLabId(tenantId: string): Promise<string> {
  const count = await LabOrder.countDocuments({ tenantId });
  return `LAB-${String(count + 1).padStart(4, "0")}`;
}

// ── GET /api/lab/orders ───────────────────────────────────────────────────────
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const { status, priority, patientId, appointmentId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status)        query.status        = status;
    if (priority)      query.priority      = priority;
    if (patientId)     query.patientId     = patientId;
    if (appointmentId) query.appointmentId = appointmentId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      LabOrder.find(query).sort({ ordered: -1 }).skip(skip).limit(parseInt(limit)),
      LabOrder.countDocuments(query),
    ]);
    res.json({ orders, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/lab/orders/:id ───────────────────────────────────────────────────
router.get("/orders/:id", async (req: AuthRequest, res) => {
  try {
    const order = await LabOrder.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!order) return res.status(404).json({ error: "Lab order not found" });
    res.json(order);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/lab/orders ──────────────────────────────────────────────────────
router.post("/orders", requireRole("admin", "doctor", "nurse", "lab_tech", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const { patientId, patientName, test, priority, notes } = req.body;
    if (!patientId || !patientName || !test) {
      return res.status(400).json({ error: "patientId, patientName, test required" });
    }
    const labId = await nextLabId(req.user!.tenantId);
    const order = await LabOrder.create({
      ...req.body,
      tenantId: req.user!.tenantId,
      labId,
      doctor: req.body.doctor || req.user!.name,
    });
    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/lab/orders/:id — update status / enter result ───────────────────
router.put("/orders/:id", requireRole("admin", "doctor", "nurse", "lab_tech"), async (req: AuthRequest, res) => {
  try {
    const allowed = ["status", "result", "priority", "notes"];
    const update: any = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // Auto-set status to Completed when result is entered
    if (update.result && !update.status) update.status = "Completed";

    const order = await LabOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: update },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Lab order not found" });
    res.json(order);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
