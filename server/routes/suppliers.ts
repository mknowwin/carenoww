import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as supplierService from "../services/supplierService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/suppliers?search=term
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { search } = req.query as { search?: string };
  const docs = await supplierService.searchSuppliers(req.user!.tenantId, search);
  res.json({ success: true, data: docs });
}));

// POST /api/suppliers
router.post("/", asyncHandler(async (req: AuthRequest, res) => {
  const { supplier, created } = await supplierService.createSupplier(req.user!.tenantId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: supplier });
}));

export default router;
