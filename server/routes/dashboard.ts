import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as dashboardService from "../services/dashboardService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard/metrics
router.get("/metrics", asyncHandler(async (req: AuthRequest, res) => {
  const data = await dashboardService.getMetrics(req.user!.tenantId, req.user!.timezone);
  res.json({ success: true, data });
}));

// GET /api/dashboard/bed-occupancy — derived from live IPD admissions
router.get("/bed-occupancy", asyncHandler(async (req: AuthRequest, res) => {
  const data = await dashboardService.getBedOccupancy(req.user!.tenantId);
  res.json({ success: true, data });
}));

// GET /api/dashboard/ai-alerts
router.get("/ai-alerts", asyncHandler(async (req: AuthRequest, res) => {
  const data = await dashboardService.getAiAlerts(req.user!.tenantId);
  res.json({ success: true, data });
}));

// GET /api/dashboard/revenue-trend — real billing aggregation by month
router.get("/revenue-trend", asyncHandler(async (req: AuthRequest, res) => {
  const data = await dashboardService.getRevenueTrend(req.user!.tenantId, req.user!.timezone);
  res.json({ success: true, data });
}));

// GET /api/dashboard/dept-volume
router.get("/dept-volume", asyncHandler(async (req: AuthRequest, res) => {
  const data = await dashboardService.getDeptVolume(req.user!.tenantId, req.user!.timezone);
  res.json({ success: true, data });
}));

// GET /api/dashboard/referral-stats?month=YYYY-MM&by=doctor|vhn — referrals per referring doctor / VHN for a month
router.get("/referral-stats", asyncHandler(async (req: AuthRequest, res) => {
  const { month, by } = req.query as Record<string, string>;
  const data = await dashboardService.getReferralStats(req.user!.tenantId, req.user!.timezone, month, by === "vhn" ? "vhn" : "doctor");
  res.json({ success: true, data });
}));

export default router;
