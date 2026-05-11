import { Router } from "express";
import Appointment from "../models/Appointment.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextAptId(tenantId: string): Promise<string> {
  const count = await Appointment.countDocuments({ tenantId });
  return `APT-${String(count + 1).padStart(3, "0")}`;
}

// GET /api/appointments
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { date, status, type, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (date) query.date = date;
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [appointments, total] = await Promise.all([
      Appointment.find(query).sort({ date: -1, time: 1 }).skip(skip).limit(parseInt(limit)),
      Appointment.countDocuments(query),
    ]);
    res.json({ appointments, total });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/appointments
router.post("/", requireRole("admin", "doctor", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const aptId = await nextAptId(req.user!.tenantId);
    const appointment = await Appointment.create({ ...req.body, tenantId: req.user!.tenantId, aptId });
    res.status(201).json(appointment);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/appointments/:id
router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    res.json(appt);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/appointments/:id
router.put("/:id", requireRole("admin", "doctor", "receptionist", "nurse"), async (req: AuthRequest, res) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    res.json(appt);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/appointments/:id
router.delete("/:id", requireRole("admin", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { status: "Cancelled" },
      { new: true }
    );
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Appointment cancelled" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
