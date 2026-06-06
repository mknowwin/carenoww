import { Router } from "express";
import Prescription from "../models/Prescription.js";
import PharmacyOrder from "../models/PharmacyOrder.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextRxId(tenantId: string): Promise<string> {
  const count = await Prescription.countDocuments({ tenantId });
  return `PRX-${String(count + 1).padStart(4, "0")}`;
}

async function nextPharmRxId(tenantId: string): Promise<string> {
  const count = await PharmacyOrder.countDocuments({ tenantId });
  return `RX-${String(count + 1).padStart(4, "0")}`;
}

// ── GET /api/prescriptions ────────────────────────────────────────────────────
router.get("/", requireRole("admin", "doctor", "nurse", "pharmacist"), async (req: AuthRequest, res) => {
  try {
    const { patientId, appointmentId, admissionId, status } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (patientId)     query.patientId     = patientId;
    if (appointmentId) query.appointmentId = appointmentId;
    if (admissionId)   query.admissionId   = admissionId;
    if (status)        query.status        = status;

    const prescriptions = await Prescription.find(query).sort({ createdAt: -1 });
    res.json(prescriptions);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/prescriptions — create prescription + auto-create pharmacy order ─
router.post("/", requireRole("admin", "doctor"), async (req: AuthRequest, res) => {
  try {
    const {
      patientId, patientName, appointmentId, admissionId,
      type, items, notes,
    } = req.body;

    if (!patientId || !patientName || !items?.length) {
      return res.status(400).json({ error: "patientId, patientName, and items[] required" });
    }

    const rxId = await nextRxId(req.user!.tenantId);

    const prescription = await Prescription.create({
      tenantId:       req.user!.tenantId,
      rxId,
      patientId, patientName,
      appointmentId:  appointmentId  || "",
      admissionId:    admissionId    || "",
      prescribedBy:   req.user!.name,
      prescribedById: req.user!.id || "",
      type:           type           || "OPD",
      items,
      notes:          notes          || "",
    });

    // Auto-create one pharmacy order per prescription with all drugs as a summary
    try {
      const pharmRxId = await nextPharmRxId(req.user!.tenantId);
      const drugSummary = items.map((it: any) =>
        `${it.drug} ${it.dose} ${it.frequency}${it.duration ? " × " + it.duration : ""}`
      ).join("; ");

      await PharmacyOrder.create({
        tenantId:    req.user!.tenantId,
        rxId:        pharmRxId,
        patientId,
        patientName,
        drug:        drugSummary,
        qty:         items.reduce((s: number, it: any) => s + (it.quantity || 1), 0),
        unit:        "units",
        type:        type || "OPD",
        doctor:      req.user!.name,
        time:        new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        prescriptionId: prescription._id.toString(),
      });
    } catch {
      // pharmacy order creation is best-effort; don't fail the prescription
    }

    res.status(201).json(prescription);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/prescriptions/:id — cancel prescription ──────────────────────────
router.put("/:id", requireRole("admin", "doctor"), async (req: AuthRequest, res) => {
  try {
    const { status, notes } = req.body;
    const update: any = {};
    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;

    const rx = await Prescription.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: update },
      { new: true }
    );
    if (!rx) return res.status(404).json({ error: "Prescription not found" });
    res.json(rx);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
