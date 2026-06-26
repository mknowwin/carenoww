import { Router } from "express";
import LabOrder from "../models/LabOrder.js";
import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
import { getNextId } from "../lib/counter.js";

const router = Router();
router.use(authMiddleware);

async function nextLabId(tenantId: string): Promise<string> {
  return getNextId(tenantId, "lab", "LAB-");
}

// ── GET /api/lab/orders ───────────────────────────────────────────────────────
router.get("/orders", requireRole("admin", "doctor", "nurse", "lab_tech"), async (req: AuthRequest, res) => {
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
router.get("/orders/:id", requireRole("admin", "doctor", "nurse", "lab_tech"), async (req: AuthRequest, res) => {
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
    const { patientId, patientName, test } = req.body;
    if (!patientId || !patientName || !test) {
      return res.status(400).json({ error: "patientId, patientName, test required" });
    }
    const labId = await nextLabId(req.user!.tenantId);
    const order = await LabOrder.create({
      ...req.body,
      tenantId: req.user!.tenantId,
      labId,
      doctor: req.body.doctor || req.user!.name,
      parameters: req.body.parameters || [],
      sampleDate: req.body.sampleDate || null,
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
    const tenantId = req.user!.tenantId;
    const allowed = ["status", "result", "priority", "notes", "parameters", "sampleDate", "reportedBy"];
    const update: any = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // Auto-set status to Completed when result is entered
    if ((update.result || (update.parameters && update.parameters.length > 0)) && !update.status) {
      update.status = "Completed";
    }

    const before = await LabOrder.findOne({ _id: req.params.id, tenantId });
    if (!before) return res.status(404).json({ error: "Lab order not found" });

    const order = await LabOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Lab order not found" });

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
          createdBy: req.user!.name,
        });
        autoBill = { billId: (bill as any).billId };
      } catch (billErr) {
        console.error("Auto-billing failed for lab order:", billErr);
      }
    }

    res.json({ ...order.toObject(), autoBill });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
