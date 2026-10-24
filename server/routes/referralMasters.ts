import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as referralMasterService from "../services/referralMasterService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/referral-masters?kind=Area|VHN|Medical Shop|Lab|Other&search=term  (top 10)
//   &all=1  → full list for the kind, for Settings
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { kind, search, all } = req.query as { kind?: string; search?: string; all?: string };
  const rows = all
    ? await referralMasterService.listReferralMasters(req.user!.tenantId, kind)
    : await referralMasterService.searchReferralMasters(req.user!.tenantId, kind, search);
  res.json({ success: true, data: rows });
}));

// POST /api/referral-masters  { kind, name }
router.post("/", asyncHandler(async (req: AuthRequest, res) => {
  const { master, created } = await referralMasterService.createReferralMaster(req.user!.tenantId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: master });
}));

// PUT /api/referral-masters/:id  { name } — master record only; past appointments keep their text
router.put("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const master = await referralMasterService.updateReferralMaster(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: master });
}));

// DELETE /api/referral-masters/:id — 409 if any appointment uses the name
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await referralMasterService.deleteReferralMaster(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

export default router;
