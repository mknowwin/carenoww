import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as reportService from "../services/reportService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/reports?patientId=X ──────────────────────────────────────────────
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { patientId } = req.query as Record<string, string>;
  const data = await reportService.listReports(req.user!.tenantId, patientId);
  res.json({ success: true, data });
}));

// ── GET /api/reports/:id/download — returns base64 data ──────────────────────
router.get("/:id/download", asyncHandler(async (req: AuthRequest, res) => {
  const data = await reportService.downloadReport(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// ── POST /api/reports — upload report ─────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "nurse", "receptionist", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await reportService.uploadReport(req.user!.tenantId, req.user!.name, req.body);
  res.status(201).json({ success: true, data });
}));

// ── PUT /api/reports/:id — update notes only ──────────────────────────────────
router.put("/:id", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const { notes } = req.body;
  const report = await reportService.updateReportNotes(req.user!.tenantId, req.params.id, notes);
  res.json({ success: true, data: report });
}));

// ── DELETE /api/reports/:id ───────────────────────────────────────────────────
router.delete("/:id", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await reportService.deleteReport(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

export default router;
