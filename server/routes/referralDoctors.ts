import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as referralDoctorService from "../services/referralDoctorService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/referral-doctors?search=term
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { search } = req.query as { search?: string };
  const docs = await referralDoctorService.searchReferralDoctors(req.user!.tenantId, search);
  res.json({ success: true, data: docs });
}));

// POST /api/referral-doctors
router.post("/", asyncHandler(async (req: AuthRequest, res) => {
  const { doctor, created } = await referralDoctorService.createReferralDoctor(req.user!.tenantId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: doctor });
}));

export default router;
