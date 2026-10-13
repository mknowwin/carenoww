import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as referralMasterService from "../services/referralMasterService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/referral-masters?kind=Area|VHN|Medical Shop|Lab|Other&search=term
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { kind, search } = req.query as { kind?: string; search?: string };
  const rows = await referralMasterService.searchReferralMasters(req.user!.tenantId, kind, search);
  res.json({ success: true, data: rows });
}));

// POST /api/referral-masters  { kind, name }
router.post("/", asyncHandler(async (req: AuthRequest, res) => {
  const { master, created } = await referralMasterService.createReferralMaster(req.user!.tenantId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: master });
}));

export default router;
