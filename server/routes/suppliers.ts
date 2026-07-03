import { Router } from "express";
import Supplier from "../models/Supplier.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/suppliers?search=term
router.get("/", async (req, res) => {
  try {
    const tenantId = (req as AuthRequest).user!.tenantId;
    const { search } = req.query as { search?: string };
    const filter: any = { tenantId };
    if (search?.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }
    const docs = await Supplier.find(filter).sort({ name: 1 }).limit(10).lean();
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/suppliers
router.post("/", async (req, res) => {
  try {
    const tenantId = (req as AuthRequest).user!.tenantId;
    const { name, phone, email, address, gstNo } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const existing = await Supplier.findOne({
      tenantId,
      name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (existing) return res.json(existing);

    const doc = await Supplier.create({
      tenantId,
      name: name.trim(),
      phone: phone?.trim() ?? "",
      email: email?.trim() ?? "",
      address: address?.trim() ?? "",
      gstNo: gstNo?.trim() ?? "",
    });
    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
