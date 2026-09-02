import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as govReportService from "../services/govReportService.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("admin", "finance"));

// GET /api/gov-reports
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const data = await govReportService.listSubmissions(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// GET /api/gov-reports/:id
router.get("/:id", asyncHandler(async (req: AuthRequest, res) => {
  const data = await govReportService.getSubmission(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// POST /api/gov-reports/generate
router.post("/generate", asyncHandler(async (req: AuthRequest, res) => {
  const { reportType, periodFrom, periodTo, investigationTypes } = req.body;
  const data = await govReportService.generateReport(
    req.user!.tenantId, req.user!.timezone, req.user!.name, req.user!.id,
    reportType, periodFrom, periodTo, investigationTypes
  );
  res.status(201).json({ success: true, data });
}));

// POST /api/gov-reports/:id/finalize
router.post("/:id/finalize", asyncHandler(async (req: AuthRequest, res) => {
  const data = await govReportService.finalizeSubmission(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// POST /api/gov-reports/:id/submit
router.post("/:id/submit", asyncHandler(async (req: AuthRequest, res) => {
  const { referenceNo } = req.body;
  const data = await govReportService.markSubmitted(req.user!.tenantId, req.params.id, req.user!.name, referenceNo);
  res.json({ success: true, data });
}));

export default router;
