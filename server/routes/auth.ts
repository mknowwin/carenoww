import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as authService from "../services/authService.js";

const router = Router();

// POST /api/auth/login
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const data = await authService.login(email, password);
  res.json({ success: true, data });
}));

// GET /api/auth/me
router.get("/me", authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const data = await authService.getMe(req.user!.id);
  res.json({ success: true, data });
}));

// PUT /api/auth/profile
router.put("/profile", authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const data = await authService.updateProfile(req.user!.id, req.body);
  res.json({ success: true, data });
}));

// GET /api/auth/clinic-settings
router.get("/clinic-settings", authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const data = await authService.getClinicSettings(req.user!.tenantId);
  res.json({ success: true, data });
}));

// PUT /api/auth/clinic-settings (admin only)
router.put("/clinic-settings", authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const data = await authService.updateClinicSettings(req.user!.tenantId, req.user!.role, req.body);
  res.json({ success: true, data });
}));

// POST /api/auth/change-password
router.post("/change-password", authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  const data = await authService.changePassword(req.user!.id, currentPassword, newPassword);
  res.json({ success: true, data });
}));

export default router;
