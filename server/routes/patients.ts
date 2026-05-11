import { Router } from "express";
import Patient from "../models/Patient.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// Generate next UHID for tenant
async function nextUHID(tenantId: string): Promise<string> {
  const last = await Patient.findOne({ tenantId }).sort({ createdAt: -1 });
  if (!last) return "UHID-001";
  const num = parseInt(last.uhid.replace("UHID-", "")) + 1;
  return `UHID-${String(num).padStart(3, "0")}`;
}

// GET /api/patients
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { status, riskLevel, search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId, isActive: true };
    if (status) query.status = status;
    if (riskLevel) query.riskLevel = riskLevel;
    if (search) query.$or = [{ name: { $regex: search, $options: "i" } }, { uhid: { $regex: search, $options: "i" } }];

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [patients, total] = await Promise.all([
      Patient.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Patient.countDocuments(query),
    ]);
    res.json({ patients, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/patients
router.post("/", requireRole("admin", "doctor", "receptionist", "nurse"), async (req: AuthRequest, res) => {
  try {
    const uhid = await nextUHID(req.user!.tenantId);
    const patient = await Patient.create({ ...req.body, tenantId: req.user!.tenantId, uhid });
    res.status(201).json(patient);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/patients/:id
router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const patient = await Patient.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/patients/:id
router.put("/:id", requireRole("admin", "doctor", "receptionist", "nurse"), async (req: AuthRequest, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/patients/:id (soft delete)
router.delete("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { isActive: false },
      { new: true }
    );
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json({ message: "Patient removed" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
