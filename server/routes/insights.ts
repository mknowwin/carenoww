import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as insightsService from "../services/insightsService.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("admin", "finance", "doctor"));

router.get("/doctor-wise", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getDoctorWise(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/department-wise", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getDepartmentWise(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/investigation-wise", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getInvestigationWise(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/investigation-list", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to, doctor, department, diagnosis } = req.query as Record<string, string>;
  const raw = req.query.investigationTypes;
  const investigationTypes = Array.isArray(raw)
    ? raw as string[]
    : (typeof raw === "string" && raw ? raw.split(",") : undefined);
  const data = await insightsService.getInvestigationList(req.user!.tenantId, req.user!.timezone, { from, to, doctor, department, diagnosis, investigationTypes });
  res.json({ success: true, data });
}));

router.get("/investigation-types", asyncHandler(async (req: AuthRequest, res) => {
  const data = await insightsService.getInvestigationTypes(req.user!.tenantId);
  res.json({ success: true, data });
}));

router.get("/diagnoses", asyncHandler(async (req: AuthRequest, res) => {
  const data = await insightsService.getDiagnoses(req.user!.tenantId);
  res.json({ success: true, data });
}));

router.get("/cash-collected", asyncHandler(async (req: AuthRequest, res) => {
  const { date } = req.query as Record<string, string>;
  const data = await insightsService.getCashCollected(req.user!.tenantId, req.user!.timezone, date);
  res.json({ success: true, data });
}));

router.get("/daily-bills-count", asyncHandler(async (req: AuthRequest, res) => {
  const { date } = req.query as Record<string, string>;
  const data = await insightsService.getDailyBillsCount(req.user!.tenantId, req.user!.timezone, date);
  res.json({ success: true, data });
}));

router.get("/referrals-by-source", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getReferralsBySource(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/referrals-by-area", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getReferralsByArea(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/return-bills", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getReturnBills(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/timewise-sales", asyncHandler(async (req: AuthRequest, res) => {
  const { date } = req.query as Record<string, string>;
  const data = await insightsService.getTimewiseSales(req.user!.tenantId, req.user!.timezone, date);
  res.json({ success: true, data });
}));

router.get("/discount-daywise", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getDiscountDaywise(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/discount-billwise", asyncHandler(async (req: AuthRequest, res) => {
  const { from, to } = req.query as Record<string, string>;
  const data = await insightsService.getDiscountBillwise(req.user!.tenantId, req.user!.timezone, from, to);
  res.json({ success: true, data });
}));

router.get("/cash-flow", asyncHandler(async (req: AuthRequest, res) => {
  const { date } = req.query as Record<string, string>;
  const data = await insightsService.getCashFlow(req.user!.tenantId, req.user!.timezone, date);
  res.json({ success: true, data });
}));

export default router;
