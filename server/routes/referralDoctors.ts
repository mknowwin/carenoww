import { Router } from "express";
import ReferralDoctor from "../models/ReferralDoctor.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/referral-doctors?search=term
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as AuthRequest).user!.tenantId;
    const { search } = req.query as { search?: string };
    const filter: any = { tenantId };
    if (search?.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }
    const docs = await ReferralDoctor.find(filter).sort({ name: 1 }).limit(10).lean();
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/referral-doctors
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as AuthRequest).user!.tenantId;
    const { name, specialization, phone, hospital } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const existing = await ReferralDoctor.findOne({
      tenantId,
      name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) return res.json(existing);

    const doc = await ReferralDoctor.create({
      tenantId,
      name: name.trim(),
      specialization: specialization?.trim() ?? "",
      phone: phone?.trim() ?? "",
      hospital: hospital?.trim() ?? "",
    });
    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
