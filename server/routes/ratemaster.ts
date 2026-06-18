import { Router } from "express";
import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/ratemaster
router.get("/", requireRole("admin", "finance", "receptionist", "doctor", "nurse", "lab_tech", "pharmacist"), async (req: AuthRequest, res) => {
  try {
    const { category, search } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId, isActive: true };
    if (category) query.category = category;
    if (search)   query.name = { $regex: search, $options: "i" };
    const rates = await ServiceRateMaster.find(query).sort({ category: 1, name: 1 });
    res.json(rates);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/ratemaster
router.post("/", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const rate = await ServiceRateMaster.create({ ...req.body, tenantId: req.user!.tenantId });
    res.status(201).json(rate);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/ratemaster/:id
router.put("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const rate = await ServiceRateMaster.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: req.body },
      { new: true }
    );
    if (!rate) return res.status(404).json({ error: "Rate not found" });
    res.json(rate);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/ratemaster/:id — soft delete
router.delete("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const rate = await ServiceRateMaster.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!rate) return res.status(404).json({ error: "Rate not found" });
    res.json({ message: "Rate deactivated" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
