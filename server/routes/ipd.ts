import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as ipdService from "../services/ipdService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/ipd — list admissions (active by default) ────────────────────────
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const data = await ipdService.listAdmissions(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// ── GET /api/ipd/beds — bed occupancy map ─────────────────────────────────────
router.get("/beds", asyncHandler(async (req: AuthRequest, res) => {
  const data = await ipdService.getBedMap(req.user!.tenantId);
  res.json({ success: true, data });
}));

// ── GET /api/ipd/:id — full admission with rounds ─────────────────────────────
router.get("/:id", asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.getAdmission(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: admission });
}));

// ── POST /api/ipd — admit patient ─────────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "nurse", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.admitPatient(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: admission });
}));

// ── POST /api/ipd/:id/rounds — add nursing round ──────────────────────────────
router.post("/:id/rounds", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const round = await ipdService.addRound(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.status(201).json({ success: true, data: round });
}));

// ── POST /api/ipd/:id/transfer — move patient to a different ward/bed ────────
router.post("/:id/transfer", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.transferPatient(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data: admission });
}));

// ── PUT /api/ipd/:id — update provisional diagnosis / ward / bed ───────────────
router.put("/:id", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.updateAdmission(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: admission });
}));

// ── POST /api/ipd/:id/discharge — discharge patient ───────────────────────────
router.post("/:id/discharge", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.dischargePatient(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data: admission });
}));

export default router;
