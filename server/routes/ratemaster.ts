import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as rateMasterService from "../services/rateMasterService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/ratemaster
router.get("/", requireRole("admin", "finance", "receptionist", "doctor", "nurse", "lab_tech", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await rateMasterService.listRates(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/ratemaster
router.post("/", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const rate = await rateMasterService.createRate(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: rate });
}));

// PUT /api/ratemaster/:id
router.put("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const rate = await rateMasterService.updateRate(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: rate });
}));

// DELETE /api/ratemaster/:id — soft delete
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await rateMasterService.deactivateRate(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

export default router;
