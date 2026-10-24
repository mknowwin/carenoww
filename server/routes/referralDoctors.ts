import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as referralDoctorService from "../services/referralDoctorService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/referral-doctors?search=term  (top 10)  |  ?all=1  (full list, for Settings)
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { search, all } = req.query as { search?: string; all?: string };
  const docs = all
    ? await referralDoctorService.listReferralDoctors(req.user!.tenantId)
    : await referralDoctorService.searchReferralDoctors(req.user!.tenantId, search);
  res.json({ success: true, data: docs });
}));

// POST /api/referral-doctors
router.post("/", asyncHandler(async (req: AuthRequest, res) => {
  const { doctor, created } = await referralDoctorService.createReferralDoctor(req.user!.tenantId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: doctor });
}));

// PUT /api/referral-doctors/:id — master record only; past appointments keep their text
router.put("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const doctor = await referralDoctorService.updateReferralDoctor(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: doctor });
}));

// DELETE /api/referral-doctors/:id — 409 if any appointment uses the name
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await referralDoctorService.deleteReferralDoctor(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

export default router;
