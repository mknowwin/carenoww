import { Router } from "express";
import Patient from "../models/Patient.js";
import Counter from "../models/Counter.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// Atomic UHID generation — race-safe via MongoDB $inc counter.
// On first call for a tenant, seeds the counter from the current max UHID
// so existing patient records stay consistent.
async function nextUHID(tenantId: string): Promise<string> {
  // Seed counter if it doesn't exist yet (handles existing data migration).
  // $setOnInsert is a no-op when the document already exists, so concurrent
  // first-time calls are safe — only one write wins, the other is ignored.
  const existing = await Counter.findOne({ tenantId, name: "patient" });
  if (!existing) {
    const last = await Patient.findOne({ tenantId }).sort({ createdAt: -1 });
    const seed = last ? (parseInt(last.uhid.replace(/\D/g, ""), 10) || 0) : 0;
    await Counter.findOneAndUpdate(
      { tenantId, name: "patient" },
      { $setOnInsert: { seq: seed } },
      { upsert: true }
    );
  }

  // Atomically increment — this is the only line that must be race-safe,
  // and MongoDB guarantees $inc on a single document is atomic.
  const counter = await Counter.findOneAndUpdate(
    { tenantId, name: "patient" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `UHID-${String(counter!.seq).padStart(3, "0")}`;
}

// Prevents regex special chars in search input from being interpreted as regex operators
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/patients
router.get("/", requireRole("admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech"), async (req: AuthRequest, res) => {
  try {
    const { status, riskLevel, search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId, isActive: true };
    if (status) query.status = status;
    if (riskLevel) query.riskLevel = riskLevel;
    if (search) {
      const escaped = escapeRegex(search);
      if (/^\d+$/.test(search)) {
        // All digits → phone prefix search (avoids text-index conflict in $or)
        query.phone = { $regex: `${escaped}`, $options: "i" };
      } else {
        query.$or = [
          { name: { $regex: escaped, $options: "i" } },
          { uhid: { $regex: escaped, $options: "i" } },
        ];
      }
    }

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
router.get("/:id", requireRole("admin", "doctor", "nurse", "receptionist", "pharmacist", "lab_tech"), async (req: AuthRequest, res) => {
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
